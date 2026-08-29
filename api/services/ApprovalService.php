<?php
/**
 * 审批引擎
 *
 * 职责：
 *   1. 按「单天累计」金额匹配规则档
 *   2. 依据规则节点生成审批任务（部门主管 / 管理员会签）
 *   3. 处理单次审批动作，推进串行分级
 *
 * 审批人只有两类：
 *   applicant_dept_manager —— 申请人所属部门的主管，写死对应关系
 *   role                   —— 全局角色（admin），配合 required_count 会签
 */
class ApprovalService {
    private PDO $db;

    /** 已提交、尚未被否决的状态，计入当天累计 */
    private const ACTIVE_STATUSES = [
        'pending', 'approved', 'ready_for_execution',
        'to_be_allocated', 'to_be_executed', 'completed',
    ];

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    // ==================== 规则匹配 ====================

    /**
     * 计算用于匹配规则的金额。
     * daily 档按「同一申请人当天未被拒绝的申请金额合计 + 本次金额」。
     * 不回溯：已通过的历史申请不因当天后续累计突破档位而重审。
     */
    public function resolveMatchAmount(
        int $projectId, ?int $submitterId, float $amount, string $scope, ?int $excludeId = null
    ): float {
        if ($scope !== 'daily' || !$submitterId) {
            return $amount;
        }
        $place  = implode(',', array_fill(0, count(self::ACTIVE_STATUSES), '?'));
        $params = array_merge([$projectId, $submitterId], self::ACTIVE_STATUSES);

        // 当前这条申请已先行落库，必须排除，否则本次金额被重复计入
        $exclude = '';
        if ($excludeId !== null) {
            $exclude  = ' AND id <> ?';
            $params[] = $excludeId;
        }
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM applications
             WHERE project_id = ? AND submitter_id = ?
               AND created_at >= date_trunc('day', CURRENT_TIMESTAMP)
               AND status IN ($place)$exclude"
        );
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
        // 先用单笔金额粗匹配拿到 scope，再按 scope 决定最终匹配金额
        $probe = $this->matchRule($projectId, $amount, $applicationType);
        $scope = $probe['amount_scope'] ?? 'daily';
        $excludeId   = $targetCol === 'application_id' ? $targetId : null;
        $matchAmount = $this->resolveMatchAmount($projectId, $submitterId, $amount, $scope, $excludeId);
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
                $candidateUserId = $this->resolveDeptManager($departmentId, $projectId);
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
