<?php
require_once __DIR__ . '/BaseRepository.php';

class ConfigRepository extends BaseRepository {
    protected string $table = '';

    public function getCurrencyTypes(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM currency_types WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getAccountTypes(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM account_types WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * 科目列表。
     * 科目按一级流水类型分池（主营收入/其他收入/营业支出/其他支出各挂各的），
     * 传 $transactionTypeCode 才是申请单表单该用的口径；只传 $type 是配置页的全量视图。
     */
    public function getSubjects(int $projectId, ?string $type = null, ?string $transactionTypeCode = null): array {
        $where = 'WHERE project_id = ?';
        $params = [$projectId];
        if ($type) {
            $where .= ' AND type = ?';
            $params[] = $type;
        }
        if ($transactionTypeCode) {
            $where .= ' AND transaction_type_code = ?';
            $params[] = $transactionTypeCode;
        }
        $stmt = $this->db->prepare("SELECT * FROM subjects $where ORDER BY id");
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** 一级流水类型（系统固定，全局共用） */
    public function getTransactionTypes(?string $direction = null): array {
        $sql = "SELECT * FROM transaction_types";
        $params = [];
        if ($direction) { $sql .= " WHERE direction = ?"; $params[] = $direction; }
        $sql .= " ORDER BY direction DESC, sort_order";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findTransactionType(string $code): ?array {
        $stmt = $this->db->prepare("SELECT * FROM transaction_types WHERE code = ?");
        $stmt->execute([$code]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** 借贷分类（系统固定，不可编辑）；direction: lend=我们借出 borrow=我们借入 */
    public function getLoanTypes(?string $direction = null): array {
        $sql = "SELECT * FROM loan_types";
        $params = [];
        if ($direction) { $sql .= " WHERE direction = ?"; $params[] = $direction; }
        $sql .= " ORDER BY sort_order";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * 部门列表附带主管姓名与成员数。
     * 此前只返回 manager_id，前端无从显示主管是谁，界面一律写死「未指定」——
     * 而审批流要求部门必须有主管，用户看不出哪个部门缺主管，只能在提交申请时踩坑。
     */
    public function getDepartments(int $projectId): array {
        $stmt = $this->db->prepare(
            "SELECT d.*,
                    u.full_name AS manager_name,
                    u.username  AS manager_username,
                    -- 按部门统计，不是按项目：原先漏了部门条件，
                    -- 每个部门都显示同一个数字（全项目的用户数）
                    (SELECT COUNT(*) FROM users mu
                     JOIN user_projects up ON up.user_id = mu.id
                     WHERE up.project_id = d.project_id
                       AND mu.department_id = d.id) AS member_count
             FROM departments d
             LEFT JOIN users u ON u.id = d.manager_id
             WHERE d.project_id = ? ORDER BY d.id"
        );
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }


    /**
     * 空编码必须存 NULL 而不是空串。
     * subjects / currency_types / departments 都有 UNIQUE(code, project_id)，
     * 空串之间会互相冲突——界面上不填编码时，每个项目只能创建一条，
     * 第二条起一律报 duplicate key。NULL 在 Postgres 唯一约束中互不冲突。
     */
    private static function nullIfBlank($code) {
        $code = is_string($code) ? trim($code) : $code;
        return ($code === '' || $code === null) ? null : $code;
    }

    public function createCurrencyType(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO currency_types (name, code, description, project_id) VALUES (?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], self::nullIfBlank($data['code'] ?? null), $data['description'] ?? '', $data['project_id']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createAccountType(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO account_types (name, code, type, description, project_id) VALUES (?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], self::nullIfBlank($data['code'] ?? null), $data['type'] ?? 'asset', $data['description'] ?? '', $data['project_id']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createSubject(array $data): array {
        $stmt = $this->db->prepare(
            "INSERT INTO subjects (name, code, type, description, project_id, transaction_type_code)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
        );
        $stmt->execute([
            $data['name'], self::nullIfBlank($data['code'] ?? null), $data['type'],
            $data['description'] ?? '', $data['project_id'], $data['transaction_type_code'],
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function findSubject(int $id, int $projectId): ?array {
        $stmt = $this->db->prepare("SELECT * FROM subjects WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function getAssetTypes(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM asset_types WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function createAssetType(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO asset_types (name, description, depreciation_rate, useful_life, project_id, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], $data['description'] ?? '', $data['depreciation_rate'] ?? 0, $data['useful_life'] ?? 0, $data['project_id'], $data['created_by'] ?? null]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createDepartment(array $data): array {
        // manager_id 此前被静默丢弃，导致前端选的部门主管从未落库
        $stmt = $this->db->prepare("INSERT INTO departments (name, code, description, project_id, manager_id) VALUES (?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([
            $data['name'], self::nullIfBlank($data['code'] ?? null), $data['description'] ?? '', $data['project_id'],
            !empty($data['manager_id']) ? (int)$data['manager_id'] : null,
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // 各表允许更新的列名白名单，防止 SQL 注入
    private const ALLOWED_COLUMNS = [
        'currency_types' => ['name', 'code', 'description', 'symbol'],
        'account_types'  => ['name', 'code', 'type', 'description'],
        'subjects'       => ['name', 'code', 'type', 'description'],
        'asset_types'    => ['name', 'description', 'depreciation_rate', 'useful_life'],
        'departments'    => ['name', 'code', 'description', 'manager_id'],
    ];

    public function updateItem(string $table, int $id, array $data, int $projectId = 0): ?array {
        // 移除不应直接更新的字段
        unset($data['project_id'], $data['created_by']);
        if (empty($data)) return null;

        // 仅保留白名单中的列，防止通过 JSON key 注入 SQL
        $allowed = self::ALLOWED_COLUMNS[$table] ?? [];
        $safeData = [];
        foreach ($data as $k => $v) {
            if (in_array($k, $allowed, true)) {
                $safeData[$k] = ($k === 'code') ? self::nullIfBlank($v) : $v;
            }
        }
        if (empty($safeData)) return null;

        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($safeData)));
        // 加 project_id 约束，防止跨项目操作
        $sql = "UPDATE $table SET $sets, updated_at = NOW() WHERE id = ?";
        $values = array_values($safeData);
        $values[] = $id;
        if ($projectId > 0) {
            $sql .= " AND project_id = ?";
            $values[] = $projectId;
        }
        $sql .= " RETURNING *";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($values);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function deleteItem(string $table, int $id, int $projectId = 0): bool {
        $sql = "DELETE FROM $table WHERE id = ?";
        $params = [$id];
        if ($projectId > 0) {
            $sql .= " AND project_id = ?";
            $params[] = $projectId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount() > 0;
    }
}
