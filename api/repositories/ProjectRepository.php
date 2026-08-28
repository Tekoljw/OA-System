<?php
require_once __DIR__ . '/BaseRepository.php';

class ProjectRepository extends BaseRepository {
    protected string $table = 'projects';

    private const ALLOWED_FIELDS = ['name', 'code', 'description', 'active'];

    private function filterFields(array $data): array {
        return array_intersect_key($data, array_flip(self::ALLOWED_FIELDS));
    }

    public function create(array $data): array {
        $data = $this->filterFields($data);
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        return parent::create($data);
    }

    public function update(int $id, array $data): ?array {
        $data = $this->filterFields($data);
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        return parent::update($id, $data);
    }

    /**
     * 检查项目是否有关联数据（账户/交易），有则不可删除
     */
    public function hasAssociatedData(int $id): array {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM accounts WHERE project_id = ?");
        $stmt->execute([$id]);
        $accountCount = (int)$stmt->fetchColumn();

        $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE project_id = ?");
        $stmt->execute([$id]);
        $txCount = (int)$stmt->fetchColumn();

        return ['accounts' => $accountCount, 'transactions' => $txCount];
    }

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
