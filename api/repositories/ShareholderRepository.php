<?php
require_once __DIR__ . '/BaseRepository.php';

class ShareholderRepository extends BaseRepository {
    protected string $table = 'shareholders';

    private const ALLOWED_FIELDS = ['name', 'share_ratio', 'contact', 'notes', 'project_id', 'created_by'];

    public function create(array $data): array {
        $data = array_intersect_key($data, array_flip(self::ALLOWED_FIELDS));
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        return parent::create($data);
    }

    public function update(int $id, array $data): ?array {
        $allowed = ['name', 'share_ratio', 'contact', 'notes'];
        $data = array_intersect_key($data, array_flip($allowed));
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        return parent::update($id, $data);
    }

    /**
     * 获取项目的所有股东
     */
    public function findByProject(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM shareholders WHERE project_id = ? ORDER BY share_ratio DESC, id ASC");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /**
     * 计算项目当前股份比例总和（排除指定ID，用于更新时验证）
     */
    public function sumShareRatio(int $projectId, ?int $excludeId = null): float {
        $sql = "SELECT COALESCE(SUM(share_ratio), 0) FROM shareholders WHERE project_id = ?";
        $params = [$projectId];
        if ($excludeId) {
            $sql .= " AND id != ?";
            $params[] = $excludeId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float)$stmt->fetchColumn();
    }

    /**
     * 检查股东是否有关联交易
     */
    public function hasTransactions(int $id): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE shareholder_id = ?");
        $stmt->execute([$id]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * 入资汇总：每个股东的入资总额
     */
    public function getContributionSummary(int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT
                s.id, s.name, s.share_ratio,
                COALESCE(SUM(CASE WHEN t.type = 'income' AND sub.code = 'income-shareholder' THEN t.amount ELSE 0 END), 0) AS total_contribution
            FROM shareholders s
            LEFT JOIN transactions t ON t.shareholder_id = s.id AND t.project_id = s.project_id AND t.status = 'completed'
            LEFT JOIN subjects sub ON sub.id = t.subject_id
            WHERE s.project_id = ?
            GROUP BY s.id, s.name, s.share_ratio
            ORDER BY s.share_ratio DESC
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /**
     * 分红汇总：每个股东已分红总额
     */
    public function getDividendSummary(int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT
                s.id, s.name, s.share_ratio,
                COALESCE(SUM(CASE WHEN t.type = 'expense' AND sub.code = 'expense-dividend' THEN t.amount ELSE 0 END), 0) AS total_dividend
            FROM shareholders s
            LEFT JOIN transactions t ON t.shareholder_id = s.id AND t.project_id = s.project_id AND t.status = 'completed'
            LEFT JOIN subjects sub ON sub.id = t.subject_id
            WHERE s.project_id = ?
            GROUP BY s.id, s.name, s.share_ratio
            ORDER BY s.share_ratio DESC
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /**
     * 项目总收入和总支出
     */
    public function getProjectFinancials(int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
            FROM transactions
            WHERE project_id = ? AND status = 'completed'
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetch(\PDO::FETCH_ASSOC);
    }
}
