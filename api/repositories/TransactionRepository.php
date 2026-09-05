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

        // 两处口径问题：
        // 1) 原先用 JOIN subjects，没有科目的流水（股东入资/分红、还款、
        //    出售资产等，它们的二级选的是股东或具体记录，本就不挂科目）
        //    会被整个排除，图表合计比实际收入少一大截，用户却看不出少了什么
        // 2) 没有过滤 status，未完成的流水也被算了进去
        // 现在按科目归类，无科目的回落到一级流水类型名，保证合计等于总额
        // 第三处口径问题：不带币种分组，等于把 CNY 和 USD 的金额直接相加。
        // 实测「其他收入」被算成 7184.89 CNY + 5700 USD = 12884.89，
        // 这个数既不是人民币也不是美元，前端却当作本位币画进图表。
        // 与 accountSummary 一样按币种拆开返回，由前端按汇率折算后汇总 ——
        // 折算放前端才能跟随本位币切换，也能复用「汇率已失效」的提示。
        $stmt = $this->db->prepare("
            SELECT COALESCE(s.name, tt.name, '未分类') as subject_name,
                   a.currency_type,
                   COALESCE(SUM(t.amount), 0) as total
            FROM transactions t
            LEFT JOIN subjects s          ON t.subject_id = s.id
            LEFT JOIN transaction_types tt ON tt.code = t.transaction_type_code
            LEFT JOIN accounts a          ON a.id = t.account_id
            WHERE t.project_id = ? AND t.type = ? AND t.status = 'completed' $dateCondition
            GROUP BY COALESCE(s.name, tt.name, '未分类'), a.currency_type
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

        // 与按科目统计同样的两处问题：JOIN 会漏掉没有部门的支出，
        // 且未过滤 status，未完成的流水也被计入
        // 同样按币种拆开，理由见 getBySubject
        $stmt = $this->db->prepare("
            SELECT COALESCE(d.name, '未指定部门') as department_name,
                   a.currency_type,
                   COALESCE(SUM(t.amount), 0) as total
            FROM transactions t
            LEFT JOIN departments d ON t.department_id = d.id
            LEFT JOIN accounts a    ON a.id = t.account_id
            WHERE t.project_id = ? AND t.type = 'expense' AND t.status = 'completed' $dateCondition
            GROUP BY COALESCE(d.name, '未指定部门'), a.currency_type
            ORDER BY total DESC
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
