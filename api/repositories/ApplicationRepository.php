<?php
require_once __DIR__ . '/BaseRepository.php';

class ApplicationRepository extends BaseRepository {
    protected string $table = 'applications';

    /** 前端各页按 type / status 两种参数名查询同一批状态，此处统一映射 */
    public const STATUS_ALIASES = [
        'all'                 => null,
        'pending'             => ['pending'],
        'approved'            => ['approved', 'ready_for_execution', 'to_be_allocated'],
        'rejected'            => ['rejected'],
        'ready_for_execution' => ['ready_for_execution', 'to_be_allocated'],
        'to_be_allocated'     => ['to_be_allocated', 'ready_for_execution'],
        'to_be_executed'      => ['to_be_executed'],
        'completed'           => ['completed'],
        'cancelled'           => ['cancelled'],
    ];

    public function findByProject(int $projectId, array $filters = [], int $page = 1, int $limit = 50): array {
        [$whereStr, $params] = $this->buildWhere($projectId, $filters);
        $offset = ($page - 1) * $limit;

        $stmt = $this->db->prepare("
            SELECT a.*, d.name AS department_name,
                   u.full_name AS submitter_name, u.username AS submitter_username,
                   tt.name AS transaction_type_name
            FROM applications a
            LEFT JOIN departments d ON a.department_id = d.id
            LEFT JOIN users u       ON a.submitter_id  = u.id
            LEFT JOIN transaction_types tt ON tt.code = a.transaction_type_code
            WHERE $whereStr
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute(array_merge($params, [$limit, $offset]));
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId, array $filters = []): int {
        [$whereStr, $params] = $this->buildWhere($projectId, $filters, 'a');
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM applications a WHERE $whereStr");
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }

    private function buildWhere(int $projectId, array $filters, string $alias = 'a'): array {
        $where  = ["$alias.project_id = ?"];
        $params = [$projectId];

        if (!empty($filters['statuses'])) {
            $place   = implode(',', array_fill(0, count($filters['statuses']), '?'));
            $where[] = "$alias.status IN ($place)";
            $params  = array_merge($params, $filters['statuses']);
        }
        if (!empty($filters['submitter_id'])) {
            $where[]  = "$alias.submitter_id = ?";
            $params[] = (int)$filters['submitter_id'];
        }
        // 待审批列表只应呈现「当前用户真正能审」的单据：
        // 当前待审节点要么指名此人（部门主管），要么是此人所属角色（管理员会签）。
        // 此前不做限制，主管能看到根本轮不到自己审的单子。
        if (!empty($filters['approvable_by'])) {
            $where[] = "EXISTS (
                SELECT 1 FROM application_approvals ap
                WHERE ap.application_id = $alias.id
                  AND ap.step_order = $alias.current_step
                  AND ap.status = 'pending'
                  AND (ap.candidate_user_id = ? OR ap.candidate_role = ?)
            )";
            $params[] = (int)$filters['approvable_by']['user_id'];
            $params[] = (string)$filters['approvable_by']['role'];
        }
        if (!empty($filters['searchTerm'])) {
            $where[]  = "($alias.title ILIKE ? OR $alias.description ILIKE ?)";
            $kw = '%' . $filters['searchTerm'] . '%';
            $params[] = $kw; $params[] = $kw;
        }
        if (!empty($filters['date'])) {
            $where[]  = "$alias.created_at::date = ?";
            $params[] = $filters['date'];
        }
        return [implode(' AND ', $where), $params];
    }

    public function findDetail(int $id, int $projectId): ?array {
        $stmt = $this->db->prepare("
            SELECT a.*, d.name AS department_name,
                   u.full_name AS submitter_name, u.username AS submitter_username,
                   tt.name AS transaction_type_name
            FROM applications a
            LEFT JOIN departments d ON a.department_id = d.id
            LEFT JOIN users u       ON a.submitter_id  = u.id
            LEFT JOIN transaction_types tt ON tt.code = a.transaction_type_code
            WHERE a.id = ? AND a.project_id = ?
        ");
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** 行锁，防止并发审批导致步骤重复推进 */
    public function findForUpdate(int $id, int $projectId): ?array {
        $stmt = $this->db->prepare(
            "SELECT * FROM applications WHERE id = ? AND project_id = ? FOR UPDATE"
        );
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function insert(array $d): array {
        $stmt = $this->db->prepare("
            INSERT INTO applications
                (project_id, type, title, amount, currency_type, department_id, submitter_id,
                 status, related_party, due_date, content, description, images, shareholder_id,
                 transaction_type_code, loan_type_code, related_loan_id, related_asset_id,
                 asset_type_id, quantity)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *
        ");
        $stmt->execute([
            $d['project_id'], $d['type'], $d['title'], $d['amount'],
            $d['currency_type'] ?? 'CNY', $d['department_id'] ?? null, $d['submitter_id'] ?? null,
            $d['status'] ?? 'pending', $d['related_party'] ?? null, $d['due_date'] ?? null,
            $d['content'] ?? null, $d['description'] ?? null,
            json_encode($d['images'] ?? [], JSON_UNESCAPED_UNICODE),
            !empty($d['shareholder_id']) ? (int)$d['shareholder_id'] : null,
            $d['transaction_type_code'] ?? null,
            !empty($d['loan_type_code'])   ? $d['loan_type_code']        : null,
            !empty($d['related_loan_id'])  ? (int)$d['related_loan_id']  : null,
            !empty($d['related_asset_id']) ? (int)$d['related_asset_id'] : null,
            !empty($d['asset_type_id'])    ? (int)$d['asset_type_id']    : null,
            max(1, (int)($d['quantity'] ?? 1)),
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateStatus(int $id, string $status, array $extra = []): void {
        $sets   = ['status = ?', 'updated_at = NOW()'];
        $params = [$status];
        foreach (['current_step', 'rule_id', 'approved_at', 'transaction_id', 'executed_at', 'executed_by',
                  'allocated_account_id', 'allocated_subject_id', 'allocated_at'] as $col) {
            if (array_key_exists($col, $extra)) {
                $sets[]   = "$col = ?";
                $params[] = $extra[$col];
            }
        }
        $params[] = $id;
        $stmt = $this->db->prepare('UPDATE applications SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $stmt->execute($params);
    }
}
