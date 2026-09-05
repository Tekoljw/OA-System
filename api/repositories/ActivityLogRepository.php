<?php
require_once __DIR__ . '/BaseRepository.php';

class ActivityLogRepository extends BaseRepository {
    protected string $table = 'activity_logs';

    /**
     * 列表与计数共用同一套筛选条件。
     *
     * 界面上的搜索框、操作类型页签、日期筛选都会把参数发过来
     * （search / action / dateFilter），但服务端此前一个都不读 ——
     * 输入什么都返回全部日志，用户以为筛选坏了。
     * 两边分开写会出现「列表筛过、总数没筛」的分页错乱，故共用。
     */
    private function buildWhere(int $projectId, array $q): array {
        $where  = ['l.project_id = ?'];
        $params = [$projectId];

        $search = trim((string)($q['search'] ?? ''));
        if ($search !== '') {
            // 与占位符「搜索用户、操作类型或内容」对应的四个字段
            $where[] = '(u.username ILIKE ? OR u.full_name ILIKE ? OR l.action ILIKE ? OR l.description ILIKE ?)';
            $kw = '%' . $search . '%';
            array_push($params, $kw, $kw, $kw, $kw);
        }

        $action = trim((string)($q['action'] ?? ''));
        if ($action !== '' && $action !== 'all') {
            $where[] = 'l.action = ?';
            $params[] = $action;
        }

        $date = trim((string)($q['dateFilter'] ?? ''));
        if ($date !== '') {
            // 先校验格式再进 SQL：非法日期会让 ::date 转换直接抛 PDOException，
            // 用户拿到的是一句没有信息量的「数据库操作失败」500
            $d = \DateTime::createFromFormat('Y-m-d', $date);
            if (!$d || $d->format('Y-m-d') !== $date) {
                throw new \InvalidArgumentException('日期格式无效，应为 YYYY-MM-DD');
            }
            $where[] = 'l.created_at::date = ?';
            $params[] = $date;
        }

        return [implode(' AND ', $where), $params];
    }

    public function findByProject(int $projectId, int $page = 1, int $limit = 20, array $q = []): array {
        [$whereStr, $params] = $this->buildWhere($projectId, $q);
        $stmt = $this->db->prepare(
            // 时间戳截到秒：PG 的微秒精度对用户无意义，且形如 12:08:55.125404
            // 的尾数会被日志检索与告警规则误匹配
            "SELECT l.*, to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
                    u.username, u.full_name
             FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             WHERE $whereStr
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute(array_merge($params, [$limit, ($page - 1) * $limit]));
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countByProject(int $projectId, array $q = []): int {
        [$whereStr, $params] = $this->buildWhere($projectId, $q);
        // 搜索条件用到 users 表的字段，计数也必须带上同一个 JOIN
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             WHERE $whereStr"
        );
        $stmt->execute($params);
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
