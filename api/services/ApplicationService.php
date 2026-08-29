<?php
require_once __DIR__ . '/../repositories/ApplicationRepository.php';
require_once __DIR__ . '/ApprovalService.php';
require_once __DIR__ . '/TransactionService.php';

/**
 * 申请单服务 —— 状态机
 *
 *   pending ──全部节点通过──→ to_be_allocated（待归帐）
 *      └──任一节点否决──→ rejected
 *   to_be_allocated ──归帐(指定账户/科目)──→ to_be_executed（待执行）
 *   to_be_executed  ──执行──→ completed  ← 此时才写 transactions、动账户余额
 */
class ApplicationService {
    private PDO $db;
    private ApplicationRepository $repo;
    private ApprovalService $approval;

    public function __construct(PDO $db) {
        $this->db       = $db;
        $this->repo     = new ApplicationRepository($db);
        $this->approval = new ApprovalService($db);
    }

    // ==================== 查询 ====================

    public function getApplications(int $projectId, array $q): array {
        $key = $q['type'] ?? $q['status'] ?? 'all';
        if (!array_key_exists($key, ApplicationRepository::STATUS_ALIASES)) {
            throw new \InvalidArgumentException('无效的状态参数: ' . $key);
        }
        $filters = ['statuses' => ApplicationRepository::STATUS_ALIASES[$key]];
        foreach (['submitter_id', 'searchTerm', 'date'] as $k) {
            if (!empty($q[$k])) $filters[$k] = $q[$k];
        }

        $page  = max(1, (int)($q['page'] ?? 1));
        $limit = min(200, max(1, (int)($q['limit'] ?? 50)));

        $rows = $this->repo->findByProject($projectId, $filters, $page, $limit);
        return [
            'applications' => array_map([$this, 'toApiShape'], $rows),
            'total' => $this->repo->countByProject($projectId, $filters),
            'page'  => $page,
            'limit' => $limit,
        ];
    }

    public function getApplication(int $id, int $projectId): array {
        $row = $this->repo->findDetail($id, $projectId);
        if (!$row) throw new \RuntimeException('申请单不存在');
        $shape = $this->toApiShape($row);
        $shape['approvals'] = $this->approval->getApprovals('application_id', $id);
        return $shape;
    }

    /** 数据库行 → 前端期望的字段名 */
    private function toApiShape(array $r): array {
        return [
            'id'          => (int)$r['id'],
            'type'        => $r['type'],
            'title'       => $r['title'],
            'amount'      => (float)$r['amount'],
            'currency'    => $r['currency_type'],
            'status'      => $r['status'],
            'date'        => substr((string)$r['created_at'], 0, 10),
            'created'     => $r['created_at'],
            'department'  => $r['department_name'] ?? '',
            'departmentId'=> $r['department_id'] !== null ? (int)$r['department_id'] : null,
            'submitter'   => $r['submitter_name'] ?? $r['submitter_username'] ?? '',
            'userId'      => $r['submitter_id'] !== null ? (int)$r['submitter_id'] : null,
            'relatedParty'=> $r['related_party'],
            'dueDate'     => $r['due_date'],
            'content'     => $r['content'],
            'description' => $r['description'],
            'images'      => json_decode($r['images'] ?? '[]', true) ?: [],
            'currentStep' => (int)$r['current_step'],
            'createdAt'   => $r['created_at'],
            'updatedAt'   => $r['updated_at'],
        ];
    }

    // ==================== 创建 ====================

    public function create(array $d): array {
        if (empty($d['title']))                                   throw new \InvalidArgumentException('标题不能为空');
        if (!isset($d['amount']) || !is_numeric($d['amount']) || (float)$d['amount'] <= 0) {
            throw new \InvalidArgumentException('金额必须大于0');
        }
        if ((float)$d['amount'] > 999999999.99)                   throw new \InvalidArgumentException('金额超出有效范围');
        if (empty($d['type']))                                    throw new \InvalidArgumentException('申请类型不能为空');
        if (empty($d['project_id']))                              throw new \InvalidArgumentException('项目ID不能为空');
        if (empty($d['department_id']))                           throw new \InvalidArgumentException('部门不能为空');

        $this->assertBelongsToProject('departments', (int)$d['department_id'], (int)$d['project_id'], '部门');

        $this->db->beginTransaction();
        try {
            $d['status'] = 'pending';
            $app = $this->repo->insert($d);

            // 生成审批链；部门无主管、会签人数不足等情况会在此抛出并回滚
            $chain = $this->approval->createApprovalChain(
                'application_id', (int)$app['id'], (int)$d['project_id'],
                (int)$d['department_id'], $d['submitter_id'] ?? null,
                (float)$d['amount'], $d['type'] ?? null
            );
            $this->repo->updateStatus((int)$app['id'], 'pending', ['rule_id' => $chain['rule_id']]);

            $this->logActivity('create', (int)$app['id'],
                sprintf('提交申请「%s」金额 %.2f', $d['title'], (float)$d['amount']),
                $d['submitter_id'] ?? null, (int)$d['project_id']);

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getApplication((int)$app['id'], (int)$d['project_id']);
    }

    // ==================== 审批 ====================

    /**
     * 单次审批动作。串行分级：当前 step 的所有会签人通过后才推进到下一 step。
     */
    public function act(int $id, int $projectId, string $decision, string $comment, array $user): array {
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            throw new \InvalidArgumentException('审批结果只能是 approved 或 rejected');
        }

        $this->db->beginTransaction();
        try {
            $app = $this->repo->findForUpdate($id, $projectId);
            if (!$app)                        throw new \RuntimeException('申请单不存在');
            if ($app['status'] !== 'pending') throw new \RuntimeException('该申请单当前状态不可审批：' . $app['status']);

            $step = (int)$app['current_step'];
            $rows = $this->approval->getApprovals('application_id', $id);
            $curr = array_values(array_filter($rows, fn($r) => (int)$r['step_order'] === $step));
            if (!$curr) throw new \RuntimeException('审批节点不存在');

            $node = $curr[0];
            if (!$this->approval->canApprove($node, $user)) {
                throw new \RuntimeException('您没有该审批节点的审批权限');
            }
            // 同一人不得在同一节点重复审批（会签需不同人）
            foreach ($curr as $r) {
                if ((int)($r['approver_id'] ?? 0) === (int)$user['id']) {
                    throw new \RuntimeException('您已在该节点完成审批，不能重复审批');
                }
            }

            $slot = null;
            foreach ($curr as $r) { if ($r['status'] === 'pending') { $slot = $r; break; } }
            if (!$slot) throw new \RuntimeException('该节点已完成审批');

            $upd = $this->db->prepare(
                "UPDATE application_approvals SET status = ?, approver_id = ?, comment = ?, acted_at = NOW() WHERE id = ?"
            );
            $upd->execute([$decision, $user['id'], $comment, $slot['id']]);

            if ($decision === 'rejected') {
                $this->repo->updateStatus($id, 'rejected');
                $this->logActivity('reject', $id, sprintf('否决申请单 #%d：%s', $id, $comment), $user['id'], $projectId);
                $this->db->commit();
                return $this->getApplication($id, $projectId);
            }

            // 统计本节点已通过人数是否满足会签要求
            $cnt = $this->db->prepare(
                "SELECT COUNT(*) FROM application_approvals
                 WHERE application_id = ? AND step_order = ? AND status = 'approved'"
            );
            $cnt->execute([$id, $step]);
            $approvedCount = (int)$cnt->fetchColumn();
            $required      = (int)$node['required_count'];

            if ($approvedCount < $required) {
                // 会签未满，补一条待审记录供下一位审批人认领
                $ins = $this->db->prepare(
                    "INSERT INTO application_approvals
                        (application_id, step_order, approver_type, candidate_role, candidate_user_id, required_count)
                     VALUES (?,?,?,?,?,?)"
                );
                $ins->execute([$id, $step, $node['approver_type'], $node['candidate_role'],
                               $node['candidate_user_id'], $required]);
                $this->logActivity('approve', $id,
                    sprintf('申请单 #%d 第%d级会签进度 %d/%d', $id, $step, $approvedCount, $required),
                    $user['id'], $projectId);
                $this->db->commit();
                return $this->getApplication($id, $projectId);
            }

            // 本节点完成，是否还有下一级
            $maxStep = 0;
            foreach ($rows as $r) { $maxStep = max($maxStep, (int)$r['step_order']); }

            if ($step < $maxStep) {
                $this->repo->updateStatus($id, 'pending', ['current_step' => $step + 1]);
                $this->logActivity('approve', $id, sprintf('申请单 #%d 第%d级通过，进入第%d级', $id, $step, $step + 1), $user['id'], $projectId);
            } else {
                $this->repo->updateStatus($id, 'to_be_allocated', ['approved_at' => date('Y-m-d H:i:s')]);
                $this->logActivity('approve', $id, sprintf('申请单 #%d 全部审批通过，转入待归帐', $id), $user['id'], $projectId);
            }

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getApplication($id, $projectId);
    }

    // ==================== 归帐 / 执行 ====================

    /** 归帐：指定账户与科目，转入待执行 */
    public function allocate(int $id, int $projectId, array $d, array $user): array {
        if (empty($d['account_id'])) throw new \InvalidArgumentException('归帐账户不能为空');
        $this->assertBelongsToProject('accounts', (int)$d['account_id'], $projectId, '账户');
        if (!empty($d['subject_id'])) {
            $this->assertBelongsToProject('subjects', (int)$d['subject_id'], $projectId, '科目');
        }

        $app = $this->repo->findDetail($id, $projectId);
        if (!$app) throw new \RuntimeException('申请单不存在');
        if (!in_array($app['status'], ['to_be_allocated', 'ready_for_execution', 'approved'], true)) {
            throw new \RuntimeException('该申请单当前状态不可归帐：' . $app['status']);
        }

        $stmt = $this->db->prepare(
            "UPDATE applications
             SET status = 'to_be_executed', allocated_account_id = ?, allocated_subject_id = ?,
                 allocated_at = NOW(), updated_at = NOW()
             WHERE id = ?"
        );
        $stmt->execute([
            (int)$d['account_id'],
            isset($d['subject_id']) ? (int)$d['subject_id'] : null,
            $id,
        ]);

        $this->logActivity('allocate', $id, sprintf('申请单 #%d 完成归帐，转入待执行', $id), $user['id'], $projectId);
        return $this->getApplication($id, $projectId);
    }

    /** 执行：生成账本流水并变动账户余额，这是唯一动账的一步 */
    public function execute(int $id, int $projectId, array $d, array $user): array {
        $this->db->beginTransaction();
        try {
            $app = $this->repo->findForUpdate($id, $projectId);
            if (!$app) throw new \RuntimeException('申请单不存在');
            if (!in_array($app['status'], ['to_be_executed', 'to_be_allocated', 'ready_for_execution'], true)) {
                throw new \RuntimeException('该申请单当前状态不可执行：' . $app['status']);
            }
            if (!empty($app['transaction_id'])) {
                throw new \RuntimeException('该申请单已执行，不能重复执行');
            }

            $accountId = (int)($d['account_id'] ?? $app['allocated_account_id'] ?? 0);
            $subjectId = $d['subject_id'] ?? $app['allocated_subject_id'] ?? null;
            if ($accountId <= 0) throw new \InvalidArgumentException('缺少归帐账户，无法执行');
            $this->assertBelongsToProject('accounts', $accountId, $projectId, '账户');

            // 收款类申请生成 income，付款类生成 expense
            $txType = in_array($app['type'], ['income', 'sales', 'lending'], true) ? 'income' : 'expense';

            $txService = new TransactionService($this->db);
            $tx = $txService->createTransaction([
                'type'             => $txType,
                'amount'           => (float)$app['amount'],
                'description'      => sprintf('[申请单#%d] %s', $id, $app['title']),
                'account_id'       => $accountId,
                'subject_id'       => $subjectId,
                'department_id'    => $app['department_id'],
                'transaction_date' => date('Y-m-d'),
                'status'           => 'completed',
                'project_id'       => $projectId,
                'created_by'       => $user['id'],
            ]);

            $this->repo->updateStatus($id, 'completed', [
                'transaction_id' => (int)$tx['id'],
                'executed_at'    => date('Y-m-d H:i:s'),
                'executed_by'    => (int)$user['id'],
            ]);
            $this->logActivity('execute', $id,
                sprintf('申请单 #%d 执行完成，生成流水 #%d', $id, (int)$tx['id']), $user['id'], $projectId);

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getApplication($id, $projectId);
    }

    public function delete(int $id, int $projectId, array $user): void {
        $app = $this->repo->findDetail($id, $projectId);
        if (!$app) throw new \RuntimeException('申请单不存在');
        if ($app['status'] === 'completed') {
            throw new \RuntimeException('已执行完成的申请单不可删除');
        }
        $stmt = $this->db->prepare("DELETE FROM applications WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        $this->logActivity('delete', $id, sprintf('删除申请单 #%d', $id), $user['id'] ?? null, $projectId);
    }

    // ==================== 内部工具 ====================

    private function assertBelongsToProject(string $table, int $id, int $projectId, string $label): void {
        $stmt = $this->db->prepare("SELECT 1 FROM $table WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        if (!$stmt->fetch()) {
            throw new \InvalidArgumentException($label . '不存在或不属于当前项目');
        }
    }

    private function logActivity(string $action, int $targetId, string $desc, ?int $userId, int $projectId): void {
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id)
             VALUES (?, 'applications', ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetId, $desc, $userId, $projectId]);
    }
}
