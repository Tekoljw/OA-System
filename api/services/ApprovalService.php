<?php
require_once __DIR__ . '/../repositories/ApprovalRuleRepository.php';
/**
 * 审批引擎
 *
 * 职责：
 *   1. 按「部门主管当日审批额度累计」匹配规则档
 *   2. 依据规则节点生成审批任务（部门主管 / 管理员会签）
 *   3. 处理单次审批动作，推进串行分级
 *
 * 审批人只有两类：
 *   applicant_dept_manager —— 申请人所属部门的主管，写死对应关系
 *   role                   —— 全局角色（admin），配合 required_count 会签
 */
class ApprovalService {
    private PDO $db;

    /** 已被否决/取消的单据不占用主管的当日审批额度 */
    private const VOID_STATUSES = ['rejected', 'cancelled'];

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    // ==================== 规则匹配 ====================

    /**
     * 计算用于匹配规则的金额。
     *
     * daily 档的口径是「该部门主管当日已审批通过的金额合计 + 本次金额」——
     * 即给主管设定每日审批权限额度，超出则本单必须升级到更高一级审批。
     * 与申请人是谁无关：同一主管审的所有单据共同消耗这一额度。
     *
     * 只统计以「部门主管」身份做出的审批。同一个人若同时是管理员，
     * 其在管理员会签节点上的审批属于另一层权限，不占用主管额度。
     */
    public function resolveMatchAmount(
        int $projectId, ?int $managerId, float $amount, string $scope
    ): float {
        if ($scope !== 'daily' || !$managerId) {
            return $amount;
        }
        $void  = implode(',', array_fill(0, count(self::VOID_STATUSES), '?'));
        $today = "ap.acted_at >= date_trunc('day', CURRENT_TIMESTAMP)";

        // 主管审批的申请单与内部划款单共同占用同一份当日额度
        $sql = "
            SELECT COALESCE(SUM(amt), 0) FROM (
                SELECT a.amount AS amt
                FROM application_approvals ap
                JOIN applications a ON a.id = ap.application_id
                WHERE ap.approver_id = ? AND ap.status = 'approved' AND $today
                  AND ap.approver_type = 'applicant_dept_manager'
                  AND a.project_id = ? AND a.status NOT IN ($void)
                UNION ALL
                SELECT t.amount AS amt
                FROM application_approvals ap
                JOIN transfers t ON t.id = ap.transfer_id
                WHERE ap.approver_id = ? AND ap.status = 'approved' AND $today
                  AND ap.approver_type = 'applicant_dept_manager'
                  AND t.project_id = ? AND t.status NOT IN ($void)
            ) x";

        $params = array_merge(
            [$managerId, $projectId], self::VOID_STATUSES,
            [$managerId, $projectId], self::VOID_STATUSES
        );
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return round((float)$stmt->fetchColumn() + $amount, 2);
    }

    /**
     * 找到匹配的规则档。区间为 [min_amount, max_amount)，max 为 NULL 表示无上限。
     */
    public function matchRule(int $projectId, float $matchAmount, ?string $applicationType = null): ?array {
        $stmt = $this->db->prepare(
            "SELECT * FROM approval_rules
             WHERE project_id = ? AND active = TRUE
               AND min_amount <= ?
               AND (max_amount IS NULL OR max_amount > ?)
               AND (application_type IS NULL OR application_type = ?)
             ORDER BY (application_type IS NOT NULL) DESC, priority ASC, min_amount DESC
             LIMIT 1"
        );
        $stmt->execute([$projectId, $matchAmount, $matchAmount, $applicationType]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function getRuleNodes(int $ruleId): array {
        $stmt = $this->db->prepare(
            "SELECT * FROM approval_rule_nodes WHERE rule_id = ? ORDER BY step_order ASC"
        );
        $stmt->execute([$ruleId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ==================== 审批任务生成 ====================

    /**
     * 为申请单/划款单生成审批任务链。
     * 必须在调用方的事务内执行。
     *
     * @param string $targetCol 'application_id' 或 'transfer_id'
     * @return array{rule_id:int, steps:int}
     */
    public function createApprovalChain(
        string $targetCol, int $targetId, int $projectId,
        ?int $departmentId, ?int $submitterId, float $amount, ?string $applicationType
    ): array {
        // 累计口径挂在部门主管身上，必须先解析出主管才能算额度
        $managerId = $this->resolveDeptManager($departmentId, $projectId);

        // 先用单笔金额粗匹配拿到 scope，再按 scope 决定最终匹配金额
        $probe       = $this->matchRule($projectId, $amount, $applicationType);
        $scope       = $probe['amount_scope'] ?? 'daily';
        $matchAmount = $this->resolveMatchAmount($projectId, $managerId, $amount, $scope);
        $rule        = $this->matchRule($projectId, $matchAmount, $applicationType);

        if (!$rule) {
            throw new \RuntimeException(
                sprintf('未找到匹配的审批规则（金额 %.2f），请先在「配置管理 → 审批规则」中配置', $matchAmount)
            );
        }

        $nodes = $this->getRuleNodes((int)$rule['id']);
        if (!$nodes) {
            throw new \RuntimeException(sprintf('审批规则「%s」未配置审批节点', $rule['name']));
        }

        $ins = $this->db->prepare(
            "INSERT INTO application_approvals
                ($targetCol, step_order, approver_type, candidate_role, candidate_user_id, required_count)
             VALUES (?, ?, ?, ?, ?, ?)"
        );

        foreach ($nodes as $node) {
            $candidateUserId = null;
            $candidateRole   = null;

            if ($node['approver_type'] === 'applicant_dept_manager') {
                $candidateUserId = $managerId;
            } else { // role
                $candidateRole = $node['approver_role'];
                $this->assertRoleHasMembers($candidateRole, (int)$node['required_count'], $projectId);
            }

            $ins->execute([
                $targetId,
                (int)$node['step_order'],
                $node['approver_type'],
                $candidateRole,
                $candidateUserId,
                (int)$node['required_count'],
            ]);
        }

        return ['rule_id' => (int)$rule['id'], 'steps' => count($nodes)];
    }

    /**
     * 解析申请人所属部门的主管。未任命主管直接阻断，不做降级兜底。
     */
    private function resolveDeptManager(?int $departmentId, int $projectId): int {
        if (!$departmentId) {
            throw new \RuntimeException('申请单未指定部门，无法确定审批主管');
        }
        $stmt = $this->db->prepare(
            "SELECT id, name, manager_id FROM departments WHERE id = ? AND project_id = ?"
        );
        $stmt->execute([$departmentId, $projectId]);
        $dept = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$dept) {
            throw new \RuntimeException('部门不存在或不属于当前项目');
        }
        if (empty($dept['manager_id'])) {
            throw new \RuntimeException(
                sprintf('部门「%s」尚未任命主管，无法发起审批，请先在「人员管理 → 部门配置」中任命部门主管', $dept['name'])
            );
        }
        return (int)$dept['manager_id'];
    }

    /**
     * 会签节点必须有足够的候选人，否则申请单会永久卡住
     */
    private function assertRoleHasMembers(?string $role, int $requiredCount, int $projectId): void {
        if (!$role) {
            throw new \RuntimeException('审批节点未配置角色');
        }
        $stmt = $this->db->prepare(
            "SELECT COUNT(DISTINCT u.id) FROM users u
             JOIN user_projects up ON up.user_id = u.id
             WHERE u.role = ? AND u.is_active = TRUE AND up.project_id = ?"
        );
        $stmt->execute([$role, $projectId]);
        $available = (int)$stmt->fetchColumn();

        if ($available < $requiredCount) {
            throw new \RuntimeException(sprintf(
                '当前项目中角色「%s」的可用人数为 %d，少于会签所需的 %d 人，无法发起审批',
                $role, $available, $requiredCount
            ));
        }
    }

    // ==================== 审批动作 ====================

    public function getApprovals(string $targetCol, int $targetId): array {
        $stmt = $this->db->prepare(
            "SELECT a.*, u.full_name AS approver_name, c.full_name AS candidate_name
             FROM application_approvals a
             LEFT JOIN users u ON u.id = a.approver_id
             LEFT JOIN users c ON c.id = a.candidate_user_id
             WHERE a.$targetCol = ? ORDER BY a.step_order ASC, a.id ASC"
        );
        $stmt->execute([$targetId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ==================== 规则配置 CRUD ====================

    public function listRules(int $projectId): array {
        return (new ApprovalRuleRepository($this->db))->findByProject($projectId);
    }

    /** 规则与节点的合法性校验，创建与更新共用 */
    private function validateRulePayload(array $d): array {
        if (empty($d['name'])) {
            throw new \InvalidArgumentException('规则名称不能为空');
        }
        $nodes = $d['nodes'] ?? [];
        if (!is_array($nodes) || !$nodes) {
            throw new \InvalidArgumentException('至少需要配置一个审批节点');
        }
        $min = (float)($d['min_amount'] ?? 0);
        $max = ($d['max_amount'] ?? null);
        if ($max !== null && $max !== '' && (float)$max <= $min) {
            throw new \InvalidArgumentException('金额上限必须大于下限');
        }
        if (!in_array($d['amount_scope'] ?? 'daily', ['single', 'daily'], true)) {
            throw new \InvalidArgumentException('计算口径无效');
        }
        foreach ($nodes as $n) {
            if (!in_array($n['approver_type'] ?? '', ['applicant_dept_manager', 'role'], true)) {
                throw new \InvalidArgumentException('审批人类型无效');
            }
            if (($n['approver_type'] === 'role') && empty($n['approver_role'])) {
                throw new \InvalidArgumentException('角色型审批节点必须指定角色');
            }
            if ((int)($n['required_count'] ?? 1) < 1) {
                throw new \InvalidArgumentException('会签人数至少为 1');
            }
        }
        return $nodes;
    }

    public function createRule(int $projectId, array $d): array {
        $nodes = $this->validateRulePayload($d);
        $repo  = new ApprovalRuleRepository($this->db);

        $this->db->beginTransaction();
        try {
            $rule = $repo->insertRule($projectId, $d);
            $repo->insertNodes((int)$rule['id'], $nodes);
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $rule;
    }

    public function updateRule(int $id, int $projectId, array $d): array {
        $nodes = $this->validateRulePayload($d);
        $repo  = new ApprovalRuleRepository($this->db);

        $this->db->beginTransaction();
        try {
            $rule = $repo->updateRule($id, $projectId, $d);
            if (!$rule) {
                $this->db->rollBack();
                throw new \RuntimeException('规则不存在');
            }
            $repo->deleteNodes((int)$rule['id']);
            $repo->insertNodes((int)$rule['id'], $nodes);
            $this->db->commit();
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
        return $rule;
    }

    public function deleteRule(int $id, int $projectId): void {
        if (!(new ApprovalRuleRepository($this->db))->deleteRule($id, $projectId)) {
            throw new \RuntimeException('规则不存在');
        }
    }

    /**
     * 判断某用户对当前步骤是否有审批资格
     */
    public function canApprove(array $approval, array $user): bool {
        if ($approval['approver_type'] === 'applicant_dept_manager') {
            return (int)$approval['candidate_user_id'] === (int)$user['id'];
        }
        return ($user['role'] ?? '') === $approval['candidate_role'];
    }
}
