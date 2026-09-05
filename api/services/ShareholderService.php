<?php
require_once __DIR__ . '/../repositories/ShareholderRepository.php';

class ShareholderService {
    private ShareholderRepository $repo;
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->repo = new ShareholderRepository($db);
    }

    /**
     * 获取项目股东列表
     */
    /**
     * share_ratio 在 PG 中是 numeric，PDO 取出来是字符串（"10.00"）。
     * 前端把它当数字参与运算，`100 - sum + share_ratio` 会退化成字符串拼接，
     * 后续 .toFixed() 直接抛 TypeError —— 股东编辑弹窗曾因此完全打不开。
     * 统一在服务层转成数字，调用方不必各自记得 Number()。
     */
    private function normalize(array $row): array {
        if (isset($row['share_ratio'])) {
            $row['share_ratio'] = (float)$row['share_ratio'];
        }
        return $row;
    }

    public function getShareholders(int $projectId): array {
        return array_map([$this, 'normalize'], $this->repo->findByProject($projectId));
    }

    /**
     * 添加股东
     */
    public function create(array $data): array {
        // trim 后再判空：empty(' ') 为 false，纯空格会被当成合法名称存进去，
        // 列表里显示为一片空白，用户既看不出是什么也搜不到。
        // 顺带把 trim 后的值写回，避免「同名但首尾空格不同」的重复记录。
        $data['name'] = trim((string)($data['name'] ?? ''));
        if ($data['name'] === '') throw new \InvalidArgumentException('股东姓名不能为空');
        if (!isset($data['share_ratio']) || !is_numeric($data['share_ratio'])) {
            throw new \InvalidArgumentException('股份比例不能为空');
        }
        $ratio = (float)$data['share_ratio'];
        if ($ratio <= 0 || $ratio > 100) {
            throw new \InvalidArgumentException('股份比例必须在 0.01~100 之间');
        }
        if (empty($data['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        // 检查比例总和是否超过 100%
        $currentSum = $this->repo->sumShareRatio((int)$data['project_id']);
        if (round($currentSum + $ratio, 2) > 100) {
            throw new \InvalidArgumentException(
                sprintf('股份比例超出限制，当前已分配 %.2f%%，最多还可分配 %.2f%%', $currentSum, 100 - $currentSum)
            );
        }

        return $this->normalize($this->repo->create($data));
    }

    /**
     * 更新股东
     */
    public function update(int $id, array $data, int $projectId): ?array {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \InvalidArgumentException('股东不存在');
        if ((int)$existing['project_id'] !== $projectId) {
            throw new \InvalidArgumentException('无权操作该股东');
        }

        if (isset($data['share_ratio'])) {
            $ratio = (float)$data['share_ratio'];
            if ($ratio <= 0 || $ratio > 100) {
                throw new \InvalidArgumentException('股份比例必须在 0.01~100 之间');
            }
            $currentSum = $this->repo->sumShareRatio($projectId, $id);
            if (round($currentSum + $ratio, 2) > 100) {
                throw new \InvalidArgumentException(
                    sprintf('股份比例超出限制，其他股东已分配 %.2f%%，最多可设置 %.2f%%', $currentSum, 100 - $currentSum)
                );
            }
        }

        return $this->normalize($this->repo->update($id, $data));
    }

    /**
     * 删除股东
     */
    public function delete(int $id, int $projectId): bool {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \InvalidArgumentException('股东不存在');
        if ((int)$existing['project_id'] !== $projectId) {
            throw new \InvalidArgumentException('无权操作该股东');
        }
        $txCount = $this->repo->hasTransactions($id);
        if ($txCount > 0) {
            throw new \RuntimeException(sprintf('该股东有 %d 条关联交易记录，无法删除', $txCount));
        }
        return $this->repo->delete($id);
    }

    /**
     * 入资分析
     */
    /**
     * 入资分析：只回按币种拆开的明细，折算与占比计算交给前端。
     *
     * 服务端算不了「应入资额」—— 那要先把各币种折成同一个口径，
     * 而汇率与「汇率是否已失效」的判断都在前端（与仪表盘一致）。
     * 这里再算一遍等于把 CNY 和 USD 直接相加，正是要修掉的问题。
     */
    public function getContributionAnalysis(int $projectId): array {
        $rows = $this->repo->getContributionSummary($projectId);
        foreach ($rows as &$row) {
            $row['share_ratio'] = (float)$row['share_ratio'];
            $row['total_contribution'] = (float)$row['total_contribution'];
        }
        return ['shareholders' => $rows];
    }

    /**
     * 分红计算
     */
    /**
     * 分红计算：同样只回按币种拆开的明细。
     *
     * 净利润是分红的基数，此前它由「不分币种直接相加的收入 - 支出」得出，
     * 6200 美元被当成 6200 元计了进去 —— 基数错了，每个股东该分多少
     * 就跟着错，而界面上完全看不出来。
     */
    public function getDividendCalculation(int $projectId): array {
        $rows = $this->repo->getDividendSummary($projectId);
        foreach ($rows as &$row) {
            $row['share_ratio'] = (float)$row['share_ratio'];
            $row['total_dividend'] = (float)$row['total_dividend'];
        }
        return [
            'financials'   => $this->repo->getProjectFinancials($projectId),
            'shareholders' => $rows,
        ];
    }
}
