<?php
/**
 * 流水衍生记录
 *
 * 一笔流水执行落账后，按其一级流水类型决定要不要在别处留一条待处理的记录：
 *
 *   贷入收入 / 借款支出 → 新建借贷记录（挂账，等着被还）
 *   还款收入 / 还款支出 → 冲减指定的那条借贷记录
 *   购买资产支出        → 新建资产记录（账面价值 = 支出金额）
 *   出售资产收入        → 冲减指定资产的账面价值
 *   股东入资 / 股东分红 → 流水上已带 shareholder_id，无需另建表
 *   主营/其他收入支出   → 不衍生
 *
 * 衍生出来的记录必须被「做平」才算结束：
 *   借贷 —— 还款流水回冲，收不回的由会计手工销账（loan_settlements.source='manual'）
 *   资产 —— 出售流水回冲，剩余部分由会计报损/减值（asset_depreciations.reason）
 * 两张留痕表只增不改，永久保留处置过程。
 */
class DerivationService
{
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * 落账后触发衍生。调用方必须已开启事务：
     * 衍生失败时流水也不能留下，否则会出现「钱动了但资产没记上」的悬空账。
     *
     * @return array{kind:string,id:int}|null 衍生结果，未衍生返回 null
     */
    public function apply(array $app, array $tx, int $projectId, array $user): ?array {
        $ttCode = $app['transaction_type_code'] ?? null;
        if (!$ttCode) return null;

        $tt = $this->findType($ttCode);
        if (!$tt) throw new \RuntimeException('流水类型不存在：' . $ttCode);

        switch ($tt['derives']) {
            case 'loan_new':     return $this->createLoan($app, $tx, $tt, $projectId, $user);
            case 'loan_settle':  return $this->settleLoan($app, $tx, $projectId, $user);
            case 'asset_new':    return $this->createAsset($app, $tx, $projectId, $user);
            case 'asset_dispose':return $this->disposeAsset($app, $tx, $projectId, $user);
            case 'shareholder':
                // 股东往来直接体现在流水的 shareholder_id 上，不再单独建记录
                if (empty($app['shareholder_id'])) {
                    throw new \InvalidArgumentException(sprintf('「%s」必须指定股东', $tt['name']));
                }
                return null;
            default:
                return null;
        }
    }

    /**
     * 提交申请单时的前置校验。
     * 放在提交环节而不是执行环节，是为了让填错的人当场知道，
     * 而不是走完整条审批链、到会计手上才失败。
     */
    public function validateApplication(array $d, int $projectId): void {
        $ttCode = $d['transaction_type_code'] ?? null;
        if (!$ttCode) throw new \InvalidArgumentException('必须选择流水类型');
        $tt = $this->findType($ttCode);
        if (!$tt) throw new \InvalidArgumentException('流水类型不存在：' . $ttCode);

        switch ($tt['second_level']) {
            case 'subject':
                // 科目可以在归账时再定，但若填了必须属于这个一级类型。
                //
                // 必须同时认 allocated_subject_id：路由把前端传的 subjectId 直接
                // 映射成了 allocated_subject_id（科目在提交时就选好，直接预置为
                // 归账结果），$d['subject_id'] 因此永远是空 —— 这个校验被
                // !empty() 整个跳过，一笔支出申请可以挂到「主营业务收入」这种
                // 收入科目上。实测库里就有这样一条错配的流水，它还会出现在
                // 仪表盘的「支出按科目」饼图里，显示成一个方向不对的分片。
                $subjectId = $d['subject_id'] ?? $d['allocated_subject_id'] ?? null;
                if (!empty($subjectId)) {
                    $this->assertSubjectMatches((int)$subjectId, $ttCode, $projectId, $tt['name']);
                }
                break;

            case 'loan_type':
                $code = $d['loan_type_code'] ?? '';
                $lt = $this->findLoanType($code);
                if (!$lt) throw new \InvalidArgumentException('必须选择借贷分类');
                if ($lt['direction'] !== $tt['loan_direction']) {
                    throw new \InvalidArgumentException(sprintf(
                        '「%s」只能选%s类的借贷分类', $tt['name'],
                        $tt['loan_direction'] === 'lend' ? '借出' : '借入'
                    ));
                }
                break;

            case 'loan':
                $loan = $this->findLoan((int)($d['related_loan_id'] ?? 0), $projectId);
                if (!$loan) throw new \InvalidArgumentException('必须选择要销账的借贷记录');
                $ltCode = $loan['type_code'] ?? '';
                $lt = $this->findLoanType($ltCode);
                if ($lt && $lt['direction'] !== $tt['loan_direction']) {
                    throw new \InvalidArgumentException(sprintf(
                        '「%s」只能销%s类的借贷记录', $tt['name'],
                        $tt['loan_direction'] === 'lend' ? '借出' : '借入'
                    ));
                }
                $this->assertNotExceed((float)$d['amount'], (float)$loan['remaining_amount'], '未结金额');
                break;

            case 'asset_type':
                if (empty($d['asset_type_id'])) throw new \InvalidArgumentException('必须选择资产分类');
                // 必须校验归属：只判非空的话，传一个别的项目的分类 ID 就能通过，
                // 执行后生成的资产记录会挂在本项目、却引用他项目的分类
                if (!$this->belongsToProject('asset_types', (int)$d['asset_type_id'], $projectId)) {
                    throw new \InvalidArgumentException('资产分类不存在或不属于当前项目');
                }
                break;

            case 'asset':
                $asset = $this->findAsset((int)($d['related_asset_id'] ?? 0), $projectId);
                if (!$asset) throw new \InvalidArgumentException('必须选择要出售的资产记录');
                $this->assertNotExceed((float)$d['amount'], (float)$asset['remaining_value'], '资产账面价值');
                break;

            case 'shareholder':
                if (empty($d['shareholder_id'])) {
                    throw new \InvalidArgumentException(sprintf('「%s」必须指定股东', $tt['name']));
                }
                // 同上：入资 / 分红都会改动股东的出资与分红累计，
                // 挂错项目的股东等于把两个项目的股权账搅在一起
                if (!$this->belongsToProject('shareholders', (int)$d['shareholder_id'], $projectId)) {
                    throw new \InvalidArgumentException('股东不存在或不属于当前项目');
                }
                break;
        }
    }

    // ==================== 各类衍生 ====================

    private function createLoan(array $app, array $tx, array $tt, int $projectId, array $user): array {
        $lt = $this->findLoanType($app['loan_type_code'] ?? '');
        if (!$lt) throw new \InvalidArgumentException('缺少借贷分类，无法生成借贷记录');

        $amount = (float)$app['amount'];
        $stmt = $this->db->prepare(
            "INSERT INTO loans
                (project_id, type, type_code, direction, currency, amount, remaining_amount,
                 borrower, repayment_date, description, department_id, status,
                 submitter_id, approver_id, approved_at, transaction_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,'已审批',?,?,NOW(),?)
             RETURNING id"
        );
        $stmt->execute([
            $projectId, $lt['name'], $lt['code'],
            $lt['direction'] === 'lend' ? '借出' : '借入',
            $app['currency_type'] ?? 'CNY', $amount, $amount,
            $app['related_party'] ?? null,
            $app['due_date'] ?? null,
            sprintf('由流水 #%d（%s）自动生成', (int)$tx['id'], $tt['name']),
            $app['department_id'] ?? null,
            $app['submitter_id'] ?? null, $user['id'] ?? null,
            (int)$tx['id'],
        ]);
        return ['kind' => 'loan', 'id' => (int)$stmt->fetchColumn()];
    }

    private function settleLoan(array $app, array $tx, int $projectId, array $user): array {
        $loanId = (int)($app['related_loan_id'] ?? 0);
        $stmt = $this->db->prepare("SELECT * FROM loans WHERE id = ? AND project_id = ? FOR UPDATE");
        $stmt->execute([$loanId, $projectId]);
        $loan = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$loan) throw new \RuntimeException('要销账的借贷记录不存在');

        $amount = (float)$app['amount'];
        $remaining = (float)$loan['remaining_amount'];
        $this->assertNotExceed($amount, $remaining, '未结金额');

        $this->db->prepare(
            "INSERT INTO loan_settlements (loan_id, project_id, amount, description, operator_id, source, transaction_id)
             VALUES (?,?,?,?,?, 'transaction', ?)"
        )->execute([
            $loanId, $projectId, $amount,
            sprintf('由还款流水 #%d 自动销账', (int)$tx['id']),
            $user['id'] ?? null, (int)$tx['id'],
        ]);

        $newRemaining = round($remaining - $amount, 2);
        $this->db->prepare(
            "UPDATE loans SET remaining_amount = ?, status = ?, updated_at = NOW() WHERE id = ?"
        )->execute([$newRemaining, $newRemaining <= 0 ? '已完成' : $loan['status'], $loanId]);

        return ['kind' => 'loan_settlement', 'id' => $loanId];
    }

    private function createAsset(array $app, array $tx, int $projectId, array $user): array {
        $qty = max(1, (int)($app['quantity'] ?? 1));
        $total = (float)$app['amount'];
        $stmt = $this->db->prepare(
            "INSERT INTO assets
                (project_id, name, asset_type_id, department_id, quantity, unit_price, total_price,
                 remaining_value, currency_type, description, status, submitter_id, approver_id,
                 approved_at, transaction_id)
             VALUES (?,?,?,?,?,?,?,?,?,?, 'normal', ?,?, NOW(), ?)
             RETURNING id"
        );
        $stmt->execute([
            $projectId, $app['title'], $app['asset_type_id'] ?? null, $app['department_id'] ?? null,
            $qty, round($total / $qty, 2), $total, $total,
            $app['currency_type'] ?? 'CNY',
            sprintf('由流水 #%d（购买资产支出）自动生成', (int)$tx['id']),
            $app['submitter_id'] ?? null, $user['id'] ?? null, (int)$tx['id'],
        ]);
        return ['kind' => 'asset', 'id' => (int)$stmt->fetchColumn()];
    }

    private function disposeAsset(array $app, array $tx, int $projectId, array $user): array {
        $assetId = (int)($app['related_asset_id'] ?? 0);
        $stmt = $this->db->prepare("SELECT * FROM assets WHERE id = ? AND project_id = ? FOR UPDATE");
        $stmt->execute([$assetId, $projectId]);
        $asset = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$asset) throw new \RuntimeException('要出售的资产记录不存在');

        $amount = (float)$app['amount'];
        $remaining = (float)$asset['remaining_value'];
        // 卖价低于账面时只冲减卖出的部分，差额留给会计报损/减值，
        // 这样资产记录上能看清「卖了多少、亏了多少」，而不是一笔糊涂账
        $this->assertNotExceed($amount, $remaining, '资产账面价值');

        $this->db->prepare(
            "INSERT INTO asset_depreciations (asset_id, project_id, quantity, amount, description, approver_id, reason, transaction_id)
             VALUES (?,?,?,?,?,?, 'sale', ?)"
        )->execute([
            $assetId, $projectId, 1, $amount,
            sprintf('由出售资产流水 #%d 自动冲减', (int)$tx['id']),
            $user['id'] ?? null, (int)$tx['id'],
        ]);

        $newRemaining = round($remaining - $amount, 2);
        $this->db->prepare(
            "UPDATE assets SET remaining_value = ?, status = ?, updated_at = NOW() WHERE id = ?"
        )->execute([$newRemaining, $newRemaining <= 0 ? 'disposed' : $asset['status'], $assetId]);

        return ['kind' => 'asset_disposal', 'id' => $assetId];
    }

    // ==================== 工具 ====================

    private function assertNotExceed(float $amount, float $limit, string $label): void {
        // 整数分比较，规避浮点误差
        if ((int)round($amount * 100) > (int)round($limit * 100)) {
            throw new \InvalidArgumentException(sprintf('金额 %.2f 超过%s %.2f', $amount, $label, $limit));
        }
    }

    /**
     * 二级选项必须属于当前项目。
     * loan / asset 通过 findLoan / findAsset 的 project_id 条件天然带上了这层校验，
     * asset_type 与 shareholder 此前只判了非空，是这一组校验里唯二的缺口。
     * 表名只允许来自本类内部的字面量，不接受外部输入。
     */
    private function belongsToProject(string $table, int $id, int $projectId): bool {
        if ($id <= 0) return false;
        if (!in_array($table, ['asset_types', 'shareholders'], true)) return false;
        $stmt = $this->db->prepare("SELECT 1 FROM $table WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        return (bool)$stmt->fetchColumn();
    }

    private function assertSubjectMatches(int $subjectId, string $ttCode, int $projectId, string $ttName): void {
        $stmt = $this->db->prepare("SELECT transaction_type_code FROM subjects WHERE id = ? AND project_id = ?");
        $stmt->execute([$subjectId, $projectId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new \InvalidArgumentException('科目不存在');
        if ($row['transaction_type_code'] !== $ttCode) {
            throw new \InvalidArgumentException(sprintf('该科目不属于「%s」', $ttName));
        }
    }

    public function findType(string $code): ?array {
        $stmt = $this->db->prepare("SELECT * FROM transaction_types WHERE code = ?");
        $stmt->execute([$code]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private function findLoanType(string $code): ?array {
        if ($code === '') return null;
        $stmt = $this->db->prepare("SELECT * FROM loan_types WHERE code = ?");
        $stmt->execute([$code]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private function findLoan(int $id, int $projectId): ?array {
        if ($id <= 0) return null;
        $stmt = $this->db->prepare("SELECT * FROM loans WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private function findAsset(int $id, int $projectId): ?array {
        if ($id <= 0) return null;
        $stmt = $this->db->prepare("SELECT * FROM assets WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
}
