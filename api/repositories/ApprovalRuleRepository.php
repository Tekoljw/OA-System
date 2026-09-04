<?php
require_once __DIR__ . '/BaseRepository.php';

class ApprovalRuleRepository extends BaseRepository {
    protected string $table = 'approval_rules';

    /** 规则连同其审批节点一并返回 */
    public function findByProject(int $projectId): array {
        $stmt = $this->db->prepare(
            "SELECT r.*,
                    COALESCE(json_agg(json_build_object(
                        'id', n.id, 'step_order', n.step_order,
                        'approver_type', n.approver_type, 'approver_role', n.approver_role,
                        'required_count', n.required_count
                    ) ORDER BY n.step_order) FILTER (WHERE n.id IS NOT NULL), '[]') AS nodes
             FROM approval_rules r
             LEFT JOIN approval_rule_nodes n ON n.rule_id = r.id
             WHERE r.project_id = ?
             GROUP BY r.id ORDER BY r.priority, r.min_amount"
        );
        $stmt->execute([$projectId]);
        return array_map(function (array $r): array {
            $r['nodes'] = json_decode($r['nodes'], true) ?: [];
            return $r;
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    public function insertRule(int $projectId, array $d): array {
        $stmt = $this->db->prepare(
            "INSERT INTO approval_rules
                (project_id, name, application_type, min_amount, max_amount, amount_scope, priority, active)
             VALUES (?,?,?,?,?,?,?,?) RETURNING *"
        );
        $stmt->execute($this->ruleParams($projectId, $d));
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateRule(int $id, int $projectId, array $d): ?array {
        $stmt = $this->db->prepare(
            "UPDATE approval_rules
             SET name=?, application_type=?, min_amount=?, max_amount=?,
                 amount_scope=?, priority=?, active=?, updated_at=NOW()
             WHERE id=? AND project_id=? RETURNING *"
        );
        $p = $this->ruleParams($projectId, $d);
        array_shift($p);                 // 去掉 project_id，它在 WHERE 里
        $stmt->execute(array_merge($p, [$id, $projectId]));
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private function ruleParams(int $projectId, array $d): array {
        $max = $d['max_amount'] ?? null;
        return [
            $projectId,
            $d['name'],
            $d['application_type'] ?? null,
            (float)($d['min_amount'] ?? 0),
            ($max === null || $max === '') ? null : (float)$max,
            $d['amount_scope'] ?? 'daily',
            (int)($d['priority'] ?? 0),
            // PDO 把 PHP 的 false 绑成空字符串，boolean 列直接拒收 ——
            // 在界面上关掉规则开关会保存失败，报「数据库操作失败」
            self::normalizeValue(array_key_exists('active', $d) ? (bool)$d['active'] : true),
        ];
    }

    public function deleteNodes(int $ruleId): void {
        $this->db->prepare("DELETE FROM approval_rule_nodes WHERE rule_id = ?")->execute([$ruleId]);
    }

    public function insertNodes(int $ruleId, array $nodes): void {
        $stmt = $this->db->prepare(
            "INSERT INTO approval_rule_nodes (rule_id, step_order, approver_type, approver_role, required_count)
             VALUES (?,?,?,?,?)"
        );
        $order = 1;
        foreach ($nodes as $n) {
            $stmt->execute([
                $ruleId,
                (int)($n['step_order'] ?? $order),
                $n['approver_type'],
                $n['approver_type'] === 'role' ? ($n['approver_role'] ?? null) : null,
                $n['approver_type'] === 'role' ? max(1, (int)($n['required_count'] ?? 1)) : 1,
            ]);
            $order++;
        }
    }

    public function deleteRule(int $id, int $projectId): bool {
        $stmt = $this->db->prepare("DELETE FROM approval_rules WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        return $stmt->rowCount() > 0;
    }
}
