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

    /**
     * @param array $q          查询参数
     * @param array|null $user  当前登录用户；用于「我的申请」与「待审批」的可见范围收敛
     */
    public function getApplications(int $projectId, array $q, ?array $user = null): array {
        $key = $q['type'] ?? $q['status'] ?? 'all';
        if (!array_key_exists($key, ApplicationRepository::STATUS_ALIASES)) {
            throw new \InvalidArgumentException('无效的状态参数: ' . $key);
        }
        $filters = ['statuses' => ApplicationRepository::STATUS_ALIASES[$key]];
        foreach (['submitter_id', 'searchTerm', 'date'] as $k) {
            if (!empty($q[$k])) $filters[$k] = $q[$k];
        }

        // 「我的申请」只看自己提交的。由后端按当前登录用户强制收敛，
        // 不能依赖前端传 submitter_id —— 那样任何人改个参数就能看别人的申请。
        if ($user && !empty($q['mine'])) {
            $filters['submitter_id'] = (int)$user['id'];
        }

        // 「待审批」只列当前用户能审的单据
        if ($user && $key === 'pending') {
            $filters['approvable_by'] = [
                'user_id' => (int)$user['id'],
                'role'    => (string)($user['role'] ?? ''),
            ];
        }

        $page  = max(1, (int)($q['page'] ?? 1));
        $limit = (($__l = (int)($q['limit'] ?? 50)) > 0 ? min(200, $__l) : 50);

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

    /**
     * 日期归一化：空值转 null，非法格式当场拒绝。
     * 只认 Y-m-d，且要求解析回来与输入一致 —— 否则 2026-13-45 这种
     * 会被 PHP 悄悄进位成 2027-01-14，存下来的是个谁也没填过的日期。
     */
    public static function normalizeDate($value, string $label): ?string {
        if ($value === null || $value === '') return null;
        $value = trim((string)$value);
        $dt = \DateTime::createFromFormat('Y-m-d', $value);
        if (!$dt || $dt->format('Y-m-d') !== $value) {
            throw new \InvalidArgumentException($label . '格式不正确，应为 2026-01-31 这样的日期');
        }
        return $value;
    }

    /** 数据库行 → 前端期望的字段名 */
    private function toApiShape(array $r): array {
        return [
            'id'          => (int)$r['id'],
            'type'        => $r['type'],
            // 一级流水类型：列表上展示它比 income/expense 有信息量得多
            'transactionTypeCode' => $r['transaction_type_code'] ?? null,
            'transactionTypeName' => $r['transaction_type_name'] ?? null,
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
            'shareholderId' => $r['shareholder_id'] !== null ? (int)$r['shareholder_id'] : null,
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
        // 金额列是 numeric(15,2)：0.001 这类会被舍成 0.00 撞上 CHECK 约束，
        // 报给用户的是一整段 SQLSTATE 原文，得在这里挡住
        if (round((float)$d['amount'], 2) < 0.01) {
            throw new \InvalidArgumentException('金额最小为 0.01');
        }
        if ((float)$d['amount'] > 999999999.99)                   throw new \InvalidArgumentException('金额超出有效范围');
        if (empty($d['type']))                                    throw new \InvalidArgumentException('申请类型不能为空');
        if (empty($d['project_id']))                              throw new \InvalidArgumentException('项目ID不能为空');
        if (empty($d['department_id']))                           throw new \InvalidArgumentException('部门不能为空');
        // 非法日期不校验的话会一路撞到 date 列上，
        // 报给用户的是「数据库操作失败」，看不出是日期填错了
        $d['due_date'] = self::normalizeDate($d['due_date'] ?? null, '期限日期');

        $this->assertBelongsToProject('departments', (int)$d['department_id'], (int)$d['project_id'], '部门');

        // 一级流水类型决定二级选什么、以及执行后要不要衍生记录。
        // 在提交环节就校验，填错当场知道，不必走完整条审批链才失败。
        require_once __DIR__ . '/DerivationService.php';
        $derivation = new DerivationService($this->db);
        $derivation->validateApplication($d, (int)$d['project_id']);

        $this->db->beginTransaction();
        try {
            $d['status'] = 'pending';
            $app = $this->repo->insert($d);

            // 入资/分红等场景在提交时就已确定账户与科目，
            // 预置为归帐结果，审批通过后直接执行即可，无需再走一次归帐。
            // 账户和科目哪个在提交时已确定就先存哪个：
            // 科目由申请人按一级类型选定，账户由会计归账时指定，两者互不依赖
            if (!empty($d['allocated_account_id']) || !empty($d['allocated_subject_id'])) {
                $extra = [];
                if (!empty($d['allocated_account_id'])) {
                    $this->assertBelongsToProject('accounts', (int)$d['allocated_account_id'], (int)$d['project_id'], '账户');
                    $extra['allocated_account_id'] = (int)$d['allocated_account_id'];
                    $extra['allocated_at']         = date('Y-m-d H:i:s');
                }
                if (!empty($d['allocated_subject_id'])) {
                    $this->assertBelongsToProject('subjects', (int)$d['allocated_subject_id'], (int)$d['project_id'], '科目');
                    $extra['allocated_subject_id'] = (int)$d['allocated_subject_id'];
                }
                $this->repo->updateStatus((int)$app['id'], 'pending', $extra);
            }

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
        // 已落账就不能再改归账账户 —— 钱已经动了，只能靠冲销处理
        if (!empty($app['transaction_id'])) {
            throw new \RuntimeException('该申请单已执行落账，不能再修改归帐账户');
        }
        // to_be_executed 也允许改：归账选错账户是常见的，执行前理应能改正，
        // 此前一旦归账就锁死，只能一路执行下去记成错账
        if (!in_array($app['status'], ['to_be_allocated', 'ready_for_execution', 'approved', 'to_be_executed'], true)) {
            throw new \RuntimeException('该申请单当前状态不可归帐：' . $app['status']);
        }
        $this->assertCurrencyMatches((int)$d['account_id'], $app);

        // 归账不传科目时保留申请人已选的科目，否则会把它清成空，
        // 落账后这笔流水就没有归类了
        $subjectId = !empty($d['subject_id'])
            ? (int)$d['subject_id']
            : (!empty($app['allocated_subject_id']) ? (int)$app['allocated_subject_id'] : null);

        $stmt = $this->db->prepare(
            "UPDATE applications
             SET status = 'to_be_executed', allocated_account_id = ?, allocated_subject_id = ?,
                 allocated_at = NOW(), updated_at = NOW()
             WHERE id = ?"
        );
        $stmt->execute([(int)$d['account_id'], $subjectId, $id]);

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
            // 执行阶段再兜底校验一次：allocate 可被跳过（直接传 account_id 执行）
            $this->assertCurrencyMatches($accountId, $app);

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
                // 股东入资/分红科目要求关联股东，申请单需把它带到落账环节
                'shareholder_id'   => $app['shareholder_id'] ?? null,
                'transaction_date' => date('Y-m-d'),
                'status'           => 'completed',
                'project_id'       => $projectId,
                'created_by'       => $user['id'],
                'transaction_type_code' => $app['transaction_type_code'] ?? null,
            ]);

            // 落账后按一级类型衍生资产/借贷记录。放在同一事务里：
            // 衍生失败流水也要回滚，否则会出现钱动了但资产没记上的悬空账
            require_once __DIR__ . '/DerivationService.php';
            $derived = (new DerivationService($this->db))->apply($app, $tx, $projectId, $user);
            if ($derived) {
                $this->logActivity('derive', $id, sprintf(
                    '申请单 #%d 衍生 %s 记录 #%d', $id, $derived['kind'], $derived['id']
                ), $user['id'], $projectId);
            }

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

    /**
     * 删除申请单。
     *
     * 此前只挡了「已执行完成」，于是任何登录用户都能删掉别人的申请，
     * 包括已经走完审批、正等着会计执行的单据 —— 审批过程与凭据一并消失，
     * 且没有任何痕迹可查。
     *
     * 现在的口径：只有提交人本人（或具备人员管理权限者）能删，
     * 且仅限尚未进入审批流转的阶段 —— 一旦有人签过字，
     * 这张单据就是审批留痕的一部分，只能驳回，不能抹掉。
     */
    public function delete(int $id, int $projectId, array $user): void {
        $app = $this->repo->findDetail($id, $projectId);
        if (!$app) throw new \RuntimeException('申请单不存在');
        if ($app['status'] === 'completed') {
            throw new \RuntimeException('已执行完成的申请单不可删除');
        }

        require_once __DIR__ . '/RoleService.php';
        $canManage = (new RoleService($this->db))->can($user, 'manage_personnel');
        $isOwner   = (int)($app['submitter_id'] ?? 0) === (int)($user['id'] ?? -1);
        if (!$isOwner && !$canManage) {
            throw new \InvalidArgumentException('只能删除本人提交的申请单');
        }

        // 审批一旦开始流转，这张单据就是留痕的一部分，不能抹掉。
        // 已驳回是例外：流程已经终结，留着也走不下去，允许提交人清理。
        if ($app['status'] !== 'rejected') {
            $acted = $this->db->prepare(
                "SELECT COUNT(*) FROM application_approvals
                 WHERE application_id = ? AND status <> 'pending'"
            );
            $acted->execute([$id]);
            if ((int)$acted->fetchColumn() > 0) {
                throw new \InvalidArgumentException(
                    '该申请单已有审批记录，不能删除。如需作废请走驳回。'
                );
            }
        }
        if (!in_array($app['status'], ['pending', 'rejected'], true)) {
            throw new \InvalidArgumentException(
                sprintf('当前状态（%s）不可删除，只有尚未开始审批或已驳回的单据可以删除', $app['status'])
            );
        }
        $stmt = $this->db->prepare("DELETE FROM applications WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        $this->logActivity('delete', $id, sprintf('删除申请单 #%d', $id), $user['id'] ?? null, $projectId);
    }

    // ==================== 内部工具 ====================

    /**
     * 归帐账户的币种必须与申请单一致。
     * 不校验的话，一笔 100 USD 的申请归到人民币账户，会直接给该账户加 100 元 ——
     * 金额原样落账、不做换算，账目从此对不上，而且没有任何报错。
     */
    /** 账户状态的中文说明 */
    private static function accountStatusLabel(?string $status): string {
        return ['inactive' => '已冻结', 'closed' => '已销户', 'frozen' => '已冻结'][$status] ?? ($status ?? '未知');
    }

    private function assertCurrencyMatches(int $accountId, array $app): void {
        $stmt = $this->db->prepare("SELECT name, currency_type, status FROM accounts WHERE id = ?");
        $stmt->execute([$accountId]);
        $acc = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$acc) throw new \InvalidArgumentException('账户不存在');

        // 冻结/销户的账户不能再收付款，否则「停用」这个状态毫无约束力
        if (($acc['status'] ?? 'active') !== 'active') {
            throw new \InvalidArgumentException(sprintf(
                '账户「%s」当前状态为%s，不能用于收付款。请先启用该账户或改选其他账户。',
                $acc['name'], self::accountStatusLabel($acc['status'])
            ));
        }

        $appCurrency = $app['currency_type'] ?? 'CNY';
        if ((string)$acc['currency_type'] !== (string)$appCurrency) {
            throw new \InvalidArgumentException(sprintf(
                '账户「%s」是 %s 账户，与申请单的 %s 不一致。请选择 %s 账户，或改用内部划款做币种转换。',
                $acc['name'], $acc['currency_type'], $appCurrency, $appCurrency
            ));
        }
    }

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
