<?php
require_once __DIR__ . '/BaseRepository.php';

class AssetRepository extends BaseRepository {
    protected string $table = 'assets';

    /** 列表附带分类名、部门名与提交/审批人姓名，前端直接可用 */
    public function findByProject(int $projectId, array $filters = [], int $page = 1, int $limit = 50): array {
        [$where, $params] = $this->buildWhere($projectId, $filters);
        $stmt = $this->db->prepare("
            SELECT a.*,
                   t.name AS asset_type_name,
                   d.name AS department,
                   su.full_name AS submitter_name,
                   au.full_name AS approver_name
            FROM assets a
            LEFT JOIN asset_types t ON a.asset_type_id = t.id
            LEFT JOIN departments d ON a.department_id = d.id
            LEFT JOIN users su      ON a.submitter_id  = su.id
            LEFT JOIN users au      ON a.approver_id   = au.id
            WHERE $where
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute(array_merge($params, [$limit, ($page - 1) * $limit]));
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId, array $filters = []): int {
        [$where, $params] = $this->buildWhere($projectId, $filters);
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM assets a WHERE $where");
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }

    private function buildWhere(int $projectId, array $filters): array {
        $where  = ['a.project_id = ?'];
        $params = [$projectId];
        if (!empty($filters['status'])) {
            $where[]  = 'a.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['asset_type_id'])) {
            $where[]  = 'a.asset_type_id = ?';
            $params[] = (int)$filters['asset_type_id'];
        }
        if (!empty($filters['search'])) {
            $where[]  = '(a.name ILIKE ? OR a.description ILIKE ?)';
            $kw = '%' . $filters['search'] . '%';
            $params[] = $kw; $params[] = $kw;
        }
        return [implode(' AND ', $where), $params];
    }

    public function findDetail(int $id, int $projectId): ?array {
        $stmt = $this->db->prepare("
            SELECT a.*, t.name AS asset_type_name, d.name AS department,
                   su.full_name AS submitter_name, au.full_name AS approver_name
            FROM assets a
            LEFT JOIN asset_types t ON a.asset_type_id = t.id
            LEFT JOIN departments d ON a.department_id = d.id
            LEFT JOIN users su      ON a.submitter_id  = su.id
            LEFT JOIN users au      ON a.approver_id   = au.id
            WHERE a.id = ? AND a.project_id = ?
        ");
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** 核销时加行锁，防止并发核销把剩余价值扣成负数 */
    public function findForUpdate(int $id, int $projectId): ?array {
        $stmt = $this->db->prepare("SELECT * FROM assets WHERE id = ? AND project_id = ? FOR UPDATE");
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function insert(array $d): array {
        $stmt = $this->db->prepare("
            INSERT INTO assets
                (project_id, name, asset_type_id, department_id, quantity, unit_price,
                 total_price, remaining_value, currency_type, description, status,
                 submitter_id, approver_id, approved_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *
        ");
        $stmt->execute([
            $d['project_id'], $d['name'],
            $d['asset_type_id'] ?? null, $d['department_id'] ?? null,
            $d['quantity'], $d['unit_price'], $d['total_price'], $d['remaining_value'],
            $d['currency_type'] ?? 'CNY', $d['description'] ?? null,
            $d['status'] ?? 'normal',
            $d['submitter_id'] ?? null, $d['approver_id'] ?? null, $d['approved_at'] ?? null,
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private const UPDATABLE = [
        'name', 'asset_type_id', 'department_id', 'quantity', 'unit_price',
        'total_price', 'remaining_value', 'currency_type', 'description', 'status',
        'approver_id', 'approved_at',
    ];

    public function updateScoped(int $id, array $d, int $projectId): ?array {
        $safe = array_intersect_key($d, array_flip(self::UPDATABLE));
        if (!$safe) return null;
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($safe)));
        $stmt = $this->db->prepare(
            "UPDATE assets SET $sets, updated_at = NOW() WHERE id = ? AND project_id = ? RETURNING *"
        );
        $stmt->execute(array_merge(array_values($safe), [$id, $projectId]));
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function deleteScoped(int $id, int $projectId): bool {
        $stmt = $this->db->prepare("DELETE FROM assets WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        return $stmt->rowCount() > 0;
    }

    // ---------- 核销明细 ----------

    public function findDepreciations(array $assetIds): array {
        if (!$assetIds) return [];
        $place = implode(',', array_fill(0, count($assetIds), '?'));
        $stmt = $this->db->prepare("
            SELECT dp.*, u.full_name AS approver_name
            FROM asset_depreciations dp
            LEFT JOIN users u ON dp.approver_id = u.id
            WHERE dp.asset_id IN ($place)
            ORDER BY dp.created_at DESC, dp.id DESC
        ");
        $stmt->execute($assetIds);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function insertDepreciation(array $d): array {
        $stmt = $this->db->prepare("
            INSERT INTO asset_depreciations
                (asset_id, project_id, quantity, amount, description, approver_id, reason)
            VALUES (?,?,?,?,?,?,?) RETURNING *
        ");
        $stmt->execute([
            $d['asset_id'], $d['project_id'], $d['quantity'], $d['amount'],
            $d['description'] ?? null, $d['approver_id'] ?? null,
            $d['reason'] ?? 'impairment',
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
}
