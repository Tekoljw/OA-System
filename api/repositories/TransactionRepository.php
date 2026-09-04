<?php
require_once __DIR__ . '/BaseRepository.php';

class TransactionRepository extends BaseRepository {
    protected string $table = 'transactions';

    public function findByProject(int $projectId, array $filters = [], int $page = 1, int $limit = 50): array {
        [$whereStr, $params] = $this->buildWhere($projectId, $filters);
        $offset = ($page - 1) * $limit;

        $stmt = $this->db->prepare("
            SELECT t.*, a.name as account_name, s.name as subject_name, d.name as department_name,
                   tt.name as transaction_type_name, tt.derives as transaction_type_derives,
                   -- 流水本身不存币种，币种跟着落账账户走
                   a.currency_type as currency_type,
                   u.full_name as submitter_name
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN subjects s ON t.subject_id = s.id
            LEFT JOIN departments d ON t.department_id = d.id
            LEFT JOIN transaction_types tt ON tt.code = t.transaction_type_code
            LEFT JOIN users u ON u.id = t.created_by
            WHERE $whereStr
            ORDER BY t.transaction_date DESC, t.id DESC
            LIMIT ? OFFSET ?
        ");
        $params[] = $limit;
        $params[] = $offset;
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId, array $filters = []): int {
        // 必须与列表用同一套过滤条件：此前 count 只认 type/status，
        // 按账户或关键字筛选后总数仍是全量，前端据此判断「还有没有下一页」必然出错
        [$whereStr, $params] = $this->buildWhere($projectId, $filters);
        $stmt = $this->db->prepare("
            SELECT COUNT(*)
            FROM transactions t
            LEFT JOIN accounts a    ON t.account_id    = a.id
            LEFT JOIN subjects s    ON t.subject_id    = s.id
            LEFT JOIN departments d ON t.department_id = d.id
            WHERE $whereStr
        ");
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /** 列表与计数共用的过滤条件 */
    private function buildWhere(int $projectId, array $filters): array {
        $where  = ['t.project_id = ?'];
        $params = [$projectId];

        if (!empty($filters['type'])) {
            $where[]  = 't.type = ?';
            $params[] = $filters['type'];
        }
        if (!empty($filters['status'])) {
            $where[]  = 't.status = ?';
            $params[] = $filters['status'];
        }
        // 内部划款产生的流水（type='transfer'）有独立页面呈现，
        // 出入金页要能把它们排除掉
        if (!empty($filters['exclude_transfer'])) {
            $where[] = "t.type <> 'transfer'";
        }
        if (!empty($filters['account_id'])) {
            $where[]  = 't.account_id = ?';
            $params[] = $filters['account_id'];
        }
        // 按一级流水类型筛选，比只分收入/支出细一层
        if (!empty($filters['transaction_type_code'])) {
            $where[]  = 't.transaction_type_code = ?';
            $params[] = $filters['transaction_type_code'];
        }
        // 关键字搜索：服务端此前根本没实现，前端传了参数也被忽略，
        // 搜什么都返回全部数据的第一页，用户以为搜到了
        if (!empty($filters['search'])) {
            $where[] = '(t.description ILIKE ? OR a.name ILIKE ? OR s.name ILIKE ? OR d.name ILIKE ?)';
            $kw = '%' . $filters['search'] . '%';
            array_push($params, $kw, $kw, $kw, $kw);
        }
        if (!empty($filters['date'])) {
            $where[]  = 't.transaction_date = ?';
            $params[] = $filters['date'];
        }

        return [implode(' AND ', $where), $params];
    }

    public function getTransactionSummary(int $projectId, string $period = 'month'): array {
        $dateCondition = $period === 'month'
            ? "AND t.transaction_date >= date_trunc('month', CURRENT_DATE)"
            : "AND t.transaction_date >= date_trunc('year', CURRENT_DATE)";

        $stmt = $this->db->prepare("
            SELECT
                type,
                COUNT(*) as count,
                COALESCE(SUM(amount), 0) as total
            FROM transactions t
            WHERE t.project_id = ? $dateCondition
            GROUP BY type
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getBySubject(int $projectId, string $type, string $period = 'month'): array {
        $dateCondition = $period === 'month'
            ? "AND t.transaction_date >= date_trunc('month', CURRENT_DATE)"
            : "AND t.transaction_date >= date_trunc('year', CURRENT_DATE)";

        $stmt = $this->db->prepare("
            SELECT s.name as subject_name, COALESCE(SUM(t.amount), 0) as total
            FROM transactions t
            JOIN subjects s ON t.subject_id = s.id
            WHERE t.project_id = ? AND t.type = ? $dateCondition
            GROUP BY s.name
            ORDER BY total DESC
        ");
        $stmt->execute([$projectId, $type]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * 按币种统计本月/上月收支及当前余额。
     * 币种记录在 accounts 表上，transactions 无 currency 字段，故需 join。
     */
    public function getCurrencyStats(int $projectId, string $currency): array {
        $stmt = $this->db->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN t.type = 'income'
                    AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
                    THEN t.amount END), 0) AS month_income,
                COALESCE(SUM(CASE WHEN t.type = 'expense'
                    AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
                    THEN t.amount END), 0) AS month_expense,
                COALESCE(SUM(CASE WHEN t.type = 'income'
                    AND t.transaction_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                    AND t.transaction_date <  date_trunc('month', CURRENT_DATE)
                    THEN t.amount END), 0) AS prev_income,
                COALESCE(SUM(CASE WHEN t.type = 'expense'
                    AND t.transaction_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                    AND t.transaction_date <  date_trunc('month', CURRENT_DATE)
                    THEN t.amount END), 0) AS prev_expense
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.project_id = ? AND a.currency_type = ? AND t.status = 'completed'
        ");
        $stmt->execute([$projectId, $currency]);
        $tx = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $balStmt = $this->db->prepare(
            "SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE project_id = ? AND currency_type = ?"
        );
        $balStmt->execute([$projectId, $currency]);

        return [
            'monthIncome'   => (float)($tx['month_income'] ?? 0),
            'monthExpense'  => (float)($tx['month_expense'] ?? 0),
            'prevIncome'    => (float)($tx['prev_income'] ?? 0),
            'prevExpense'   => (float)($tx['prev_expense'] ?? 0),
            'currentBalance' => (float)$balStmt->fetchColumn(),
        ];
    }

    public function getByDepartment(int $projectId, string $period = 'month'): array {
        $dateCondition = $period === 'month'
            ? "AND t.transaction_date >= date_trunc('month', CURRENT_DATE)"
            : "AND t.transaction_date >= date_trunc('year', CURRENT_DATE)";

        $stmt = $this->db->prepare("
            SELECT d.name as department_name, COALESCE(SUM(t.amount), 0) as total
            FROM transactions t
            JOIN departments d ON t.department_id = d.id
            WHERE t.project_id = ? AND t.type = 'expense' $dateCondition
            GROUP BY d.name
            ORDER BY total DESC
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
