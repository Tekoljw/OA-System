<?php
require_once __DIR__ . '/BaseRepository.php';

class AccountRepository extends BaseRepository {
    protected string $table = 'accounts';

    public function findByProject(int $projectId, int $page = 1, int $limit = 50): array {
        $offset = ($page - 1) * $limit;
        $stmt = $this->db->prepare("
            SELECT * FROM accounts
            WHERE project_id = ? AND (status IS NULL OR status != 'closed')
            ORDER BY id DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$projectId, $limit, $offset]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM accounts WHERE project_id = ? AND (status IS NULL OR status != 'closed')");
        $stmt->execute([$projectId]);
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
