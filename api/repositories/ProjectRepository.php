<?php
require_once __DIR__ . '/BaseRepository.php';

class ProjectRepository extends BaseRepository {
    protected string $table = 'projects';

    public function findActive(): array {
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE active = true ORDER BY id");
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findByCode(string $code): ?array {
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE code = ?");
        $stmt->execute([$code]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }
}
