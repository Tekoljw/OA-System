<?php
require_once __DIR__ . '/../repositories/AssetRepository.php';

/**
 * 资产记录服务
 *
 * 核销（折旧）是唯一会改动金额的操作：递减 remaining_value 并写一条明细，
 * 在事务内对资产行加锁，防止并发核销把剩余价值扣成负数。
 */
class AssetService {
    private PDO $db;
    private AssetRepository $repo;

    public function __construct(PDO $db) {
        $this->db   = $db;
        $this->repo = new AssetRepository($db);
    }

    public function getAssets(int $projectId, array $q): array {
        $page  = max(1, (int)($q['page'] ?? 1));
        $limit = min(200, max(1, (int)($q['limit'] ?? 50)));
        $filters = array_filter([
            'status'        => $q['status'] ?? null,
            'asset_type_id' => $q['assetTypeId'] ?? $q['asset_type_id'] ?? null,
            'search'        => $q['search'] ?? null,
        ]);

        $rows = $this->repo->findByProject($projectId, $filters, $page, $limit);

        // 一次性取回本页资产的核销明细，避免 N+1 查询
        $byAsset = [];
        foreach ($this->repo->findDepreciations(array_column($rows, 'id')) as $dp) {
            $byAsset[(int)$dp['asset_id']][] = $this->shapeDepreciation($dp);
        }
        foreach ($rows as &$r) {
            $r['depreciation_records'] = $byAsset[(int)$r['id']] ?? [];
        }
        unset($r);

        return [
            'assets' => $rows,
            'total'  => $this->repo->countByProject($projectId, $filters),
            'page'   => $page,
            'limit'  => $limit,
        ];
    }

    private function shapeDepreciation(array $dp): array {
        return [
            'id'          => (int)$dp['id'],
            'date'        => substr((string)$dp['created_at'], 0, 10),
            'quantity'    => (int)$dp['quantity'],
            'amount'      => (float)$dp['amount'],
            'description' => $dp['description'],
            'approver'    => $dp['approver_name'] ?? '',
            'reason'      => $dp['reason'] ?? 'impairment',
            'reasonText'  => [
                'depreciation' => '折旧',
                'impairment'   => '减值',
                'writeoff'     => '报损',
                'sale'         => '出售',
            ][$dp['reason'] ?? 'impairment'] ?? $dp['reason'],
        ];
    }

    public function getAsset(int $id, int $projectId): array {
        $row = $this->repo->findDetail($id, $projectId);
        if (!$row) throw new \RuntimeException('资产不存在');
        $row['depreciation_records'] = array_map(
            [$this, 'shapeDepreciation'],
            $this->repo->findDepreciations([$id])
        );
        return $row;
    }

    public function create(array $d): array {
        if (empty($d['name']))       throw new \InvalidArgumentException('资产名称不能为空');
        if (empty($d['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        $quantity  = (int)($d['quantity'] ?? 1);
        $unitPrice = (float)($d['unit_price'] ?? 0);
        if ($quantity <= 0)   throw new \InvalidArgumentException('数量必须大于0');
        if ($unitPrice < 0)   throw new \InvalidArgumentException('单价不能为负数');

        $total = round($quantity * $unitPrice, 2);
        if ($total > 999999999.99) throw new \InvalidArgumentException('资产总值超出有效范围');

        foreach ([['asset_types', 'asset_type_id', '资产分类'], ['departments', 'department_id', '部门']] as [$t, $k, $label]) {
            if (!empty($d[$k])) $this->assertBelongsToProject($t, (int)$d[$k], (int)$d['project_id'], $label);
        }

        $d['quantity']        = $quantity;
        $d['unit_price']      = $unitPrice;
        $d['total_price']     = $total;
        $d['remaining_value'] = $total;   // 新入账资产剩余价值等于原值

        $asset = $this->repo->insert($d);
        $this->logActivity('create', (int)$asset['id'],
            sprintf('新增资产「%s」价值 %.2f', $d['name'], $total),
            $d['submitter_id'] ?? null, (int)$d['project_id']);
        return $this->getAsset((int)$asset['id'], (int)$d['project_id']);
    }

    public function update(int $id, array $d, int $projectId, array $user): array {
        $asset = $this->repo->findDetail($id, $projectId);
        if (!$asset) throw new \RuntimeException('资产不存在');

        // 数量或单价变化时同步重算总值，并按已核销金额校正剩余价值
        if (array_key_exists('quantity', $d) || array_key_exists('unit_price', $d)) {
            $quantity  = (int)($d['quantity'] ?? $asset['quantity']);
            $unitPrice = (float)($d['unit_price'] ?? $asset['unit_price']);
            if ($quantity <= 0) throw new \InvalidArgumentException('数量必须大于0');
            if ($unitPrice < 0) throw new \InvalidArgumentException('单价不能为负数');

            $newTotal    = round($quantity * $unitPrice, 2);
            $depreciated = round((float)$asset['total_price'] - (float)$asset['remaining_value'], 2);
            if ($newTotal < $depreciated) {
                throw new \InvalidArgumentException(sprintf(
                    '新总值 %.2f 低于已核销金额 %.2f，无法修改', $newTotal, $depreciated
                ));
            }
            $d['quantity']        = $quantity;
            $d['unit_price']      = $unitPrice;
            $d['total_price']     = $newTotal;
            $d['remaining_value'] = round($newTotal - $depreciated, 2);
        }

        $updated = $this->repo->updateScoped($id, $d, $projectId);
        if (!$updated) throw new \InvalidArgumentException('无有效的可修改字段');

        $this->logActivity('update', $id, sprintf('修改资产「%s」', $updated['name']),
            $user['id'] ?? null, $projectId);
        return $this->getAsset($id, $projectId);
    }

    /** 核销：递减剩余价值并留痕 */
    public function depreciate(int $id, int $projectId, array $d, array $user): array {
        $amount   = (float)($d['amount'] ?? 0);
        $quantity = (int)($d['quantity'] ?? 1);
        if ($amount <= 0)   throw new \InvalidArgumentException('核销金额必须大于0');
        if ($quantity <= 0) throw new \InvalidArgumentException('核销数量必须大于0');

        // 系统不自动折旧，三种原因都由会计手动操作，但记录上要分得开：
        // depreciation 正常损耗分摊 / impairment 价值下跌 / writeoff 资产灭失
        // （sale 只能由出售流水产生，不接受手工传入）
        $reason = $d['reason'] ?? 'impairment';
        if (!in_array($reason, ['depreciation', 'impairment', 'writeoff'], true)) {
            throw new \InvalidArgumentException('处置原因无效，仅支持：折旧、减值、报损');
        }

        $this->db->beginTransaction();
        try {
            $asset = $this->repo->findForUpdate($id, $projectId);
            if (!$asset) throw new \RuntimeException('资产不存在');

            $remaining = (float)$asset['remaining_value'];
            // 用整数分比较，规避浮点误差
            if ((int)round($amount * 100) > (int)round($remaining * 100)) {
                throw new \InvalidArgumentException(sprintf(
                    '核销金额 %.2f 超过剩余价值 %.2f', $amount, $remaining
                ));
            }
            if ($quantity > (int)$asset['quantity']) {
                throw new \InvalidArgumentException(sprintf(
                    '核销数量 %d 超过资产数量 %d', $quantity, (int)$asset['quantity']
                ));
            }

            $this->repo->insertDepreciation([
                'asset_id'    => $id,
                'project_id'  => $projectId,
                'quantity'    => $quantity,
                'amount'      => $amount,
                'description' => $d['description'] ?? null,
                'approver_id' => $user['id'] ?? null,
                'reason'      => $reason,
            ]);

            $newRemaining = round($remaining - $amount, 2);
            $this->repo->updateScoped($id, [
                'remaining_value' => $newRemaining,
                // 剩余价值归零即视为已核销完毕
                'status' => $newRemaining <= 0 ? 'written_off' : 'depreciating',
            ], $projectId);

            $reasonText = ['depreciation' => '折旧', 'impairment' => '减值', 'writeoff' => '报损'][$reason];
            $this->logActivity('depreciate', $id,
                sprintf('%s资产「%s」%.2f，剩余 %.2f', $reasonText, $asset['name'], $amount, $newRemaining),
                $user['id'] ?? null, $projectId);

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getAsset($id, $projectId);
    }

    public function delete(int $id, int $projectId, array $user): void {
        $asset = $this->repo->findDetail($id, $projectId);
        if (!$asset) throw new \RuntimeException('资产不存在');
        if (!$this->repo->deleteScoped($id, $projectId)) {
            throw new \RuntimeException('删除失败');
        }
        $this->logActivity('delete', $id, sprintf('删除资产「%s」', $asset['name']),
            $user['id'] ?? null, $projectId);
    }

    private function assertBelongsToProject(string $table, int $id, int $projectId, string $label): void {
        $stmt = $this->db->prepare("SELECT 1 FROM $table WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        if (!$stmt->fetch()) {
            throw new \InvalidArgumentException($label . '不存在或不属于当前项目');
        }
    }

    private function logActivity(string $action, int $targetId, string $desc, ?int $userId, int $projectId): void {
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id)
             VALUES (?, 'assets', ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetId, $desc, $userId, $projectId]);
    }
}
