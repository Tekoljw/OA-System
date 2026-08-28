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
    public function getShareholders(int $projectId): array {
        return $this->repo->findByProject($projectId);
    }

    /**
     * 添加股东
     */
    public function create(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('股东姓名不能为空');
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

        return $this->repo->create($data);
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

        return $this->repo->update($id, $data);
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
    public function getContributionAnalysis(int $projectId): array {
        $contributions = $this->repo->getContributionSummary($projectId);
        $totalContribution = array_sum(array_column($contributions, 'total_contribution'));

        foreach ($contributions as &$row) {
            $row['share_ratio'] = (float)$row['share_ratio'];
            $row['total_contribution'] = (float)$row['total_contribution'];
            // 按比例应入资金额
            $row['expected_contribution'] = $totalContribution > 0
                ? round($totalContribution * $row['share_ratio'] / 100, 2)
                : 0;
            // 差额：正数=多入，负数=少入
            $row['difference'] = round($row['total_contribution'] - $row['expected_contribution'], 2);
        }

        return [
            'shareholders' => $contributions,
            'total_contribution' => round($totalContribution, 2),
        ];
    }

    /**
     * 分红计算
     */
    public function getDividendCalculation(int $projectId): array {
        $financials = $this->repo->getProjectFinancials($projectId);
        $totalIncome = (float)$financials['total_income'];
        $totalExpense = (float)$financials['total_expense'];
        $netProfit = round($totalIncome - $totalExpense, 2);

        $dividends = $this->repo->getDividendSummary($projectId);
        $totalDividendPaid = 0;

        foreach ($dividends as &$row) {
            $row['share_ratio'] = (float)$row['share_ratio'];
            $row['total_dividend'] = (float)$row['total_dividend'];
            $totalDividendPaid += $row['total_dividend'];
            // 按比例可分红金额（基于净利润）
            $row['entitled_dividend'] = $netProfit > 0
                ? round($netProfit * $row['share_ratio'] / 100, 2)
                : 0;
            // 剩余可分红 = 应得 - 已分
            $row['remaining_dividend'] = round($row['entitled_dividend'] - $row['total_dividend'], 2);
        }

        return [
            'total_income' => round($totalIncome, 2),
            'total_expense' => round($totalExpense, 2),
            'net_profit' => $netProfit,
            'distributable' => max(0, round($netProfit - $totalDividendPaid, 2)),
            'total_dividend_paid' => round($totalDividendPaid, 2),
            'shareholders' => $dividends,
        ];
    }
}
