<?php
require_once __DIR__ . '/BaseRepository.php';

class ActivityLogRepository extends BaseRepository {
    protected string $table = 'activity_logs';

    public function findByProject(int $projectId, int $page = 1, int $limit = 20): array {
        $stmt = $this->db->prepare(
            "SELECT l.*, u.username, u.full_name
             FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             WHERE l.project_id = ?
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute([$projectId, $limit, ($page - 1) * $limit]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM activity_logs WHERE project_id = ?");
        $stmt->execute([$projectId]);
        return (int)$stmt->fetchColumn();
    }

    public function record(array $d): array {
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
        );
        $stmt->execute([
            $d['action'] ?? '',
            $d['target_type'] ?? 'system',
            $d['target_id'] ?? null,
            $d['description'] ?? '',
            $d['user_id'] ?? null,
            $d['project_id'],
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
}
