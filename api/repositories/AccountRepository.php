<?php
require_once __DIR__ . '/BaseRepository.php';

class AccountRepository extends BaseRepository {
    protected string $table = 'accounts';

    public function findByProject(int $projectId, int $page = 1, int $limit = 50, ?string $currency = null, ?string $type = null): array {
        $offset = ($page - 1) * $limit;
        $sql = "SELECT * FROM accounts WHERE project_id = ? AND (status IS NULL OR status != 'closed')";
        $params = [$projectId];
        if ($currency) {
            $sql .= " AND currency_type = ?";
            $params[] = $currency;
        }
        if ($type) {
            $sql .= " AND account_type = ?";
            $params[] = $type;
        }
        $sql .= " ORDER BY id DESC LIMIT ? OFFSET ?";
        $params[] = $limit;
        $params[] = $offset;
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId, ?string $currency = null, ?string $type = null): int {
        $sql = "SELECT COUNT(*) FROM accounts WHERE project_id = ? AND (status IS NULL OR status != 'closed')";
        $params = [$projectId];
        if ($currency) {
            $sql .= " AND currency_type = ?";
            $params[] = $currency;
        }
        if ($type) {
            $sql .= " AND account_type = ?";
            $params[] = $type;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    public function getAccountSummary(int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT
                currency_type,
                COUNT(*) as account_count,
                COALESCE(SUM(balance), 0) as total_balance
            FROM accounts
            WHERE project_id = ? AND (status IS NULL OR status != 'closed')
            GROUP BY currency_type
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
