<?php
/**
 * 借贷记录服务
 *
 * 结算是唯一改动金额的操作：递减 remaining_amount 并写一条明细，
 * 在事务内对借贷行加锁，防止并发结算把未结金额扣成负数。
 * 返回结构直接对齐前端 src/types/loan.ts 的 Loan 接口。
 */
class LoanService {
    private PDO $db;

    private const TYPES = ['应收款','预收款','应付款','预付款','押金','借出','借入'];

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function getLoans(int $projectId, array $q): array {
        $where  = ['l.project_id = ?'];
        $params = [$projectId];

        $type = $q['type'] ?? null;
        if ($type && $type !== 'all' && $type !== '全部') {
            if (!in_array($type, self::TYPES, true)) {
                throw new \InvalidArgumentException('借贷类型无效');
            }
            $where[] = 'l.type = ?';
            $params[] = $type;
        }
        if (!empty($q['searchTerm'])) {
            $where[] = '(l.description ILIKE ? OR l.borrower ILIKE ?)';
            $kw = '%' . $q['searchTerm'] . '%';
            $params[] = $kw; $params[] = $kw;
        }
        if (!empty($q['date'])) {
            $where[] = 'l.created_at::date = ?';
            $params[] = $q['date'];
        }

        $page  = max(1, (int)($q['page'] ?? 1));
        $limit = min(200, max(1, (int)($q['limit'] ?? 50)));
        $whereStr = implode(' AND ', $where);

        $stmt = $this->db->prepare("
            SELECT l.*, d.name AS department,
                   su.full_name AS submitter_name, au.full_name AS approver_name
            FROM loans l
            LEFT JOIN departments d ON l.department_id = d.id
            LEFT JOIN users su      ON l.submitter_id  = su.id
            LEFT JOIN users au      ON l.approver_id   = au.id
            WHERE $whereStr ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?
        ");
        $stmt->execute(array_merge($params, [$limit, ($page - 1) * $limit]));
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $settlements = $this->findSettlements(array_column($rows, 'id'));

        $cnt = $this->db->prepare("SELECT COUNT(*) FROM loans l WHERE $whereStr");
        $cnt->execute($params);

        return [
            'loans' => array_map(fn($r) => $this->toApiShape($r, $settlements[(int)$r['id']] ?? []), $rows),
            'total' => (int)$cnt->fetchColumn(),
            'page'  => $page,
            'limit' => $limit,
        ];
    }

    /** 一次取回本页所有结算明细，避免 N+1 查询 */
    private function findSettlements(array $loanIds): array {
        if (!$loanIds) return [];
        $place = implode(',', array_fill(0, count($loanIds), '?'));
        $stmt = $this->db->prepare("
            SELECT s.*, u.full_name AS operator_name
            FROM loan_settlements s
            LEFT JOIN users u ON s.operator_id = u.id
            WHERE s.loan_id IN ($place) ORDER BY s.created_at DESC, s.id DESC
        ");
        $stmt->execute($loanIds);
        $byLoan = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $s) {
            $byLoan[(int)$s['loan_id']][] = [
                'id'          => (string)$s['id'],
                'amount'      => (float)$s['amount'],
                'description' => $s['description'] ?? '',
                'settledAt'   => substr((string)$s['created_at'], 0, 19),
                'settledBy'   => $s['operator_name'] ?? '',
            ];
        }
        return $byLoan;
    }

    private function toApiShape(array $r, array $settlements): array {
        return [
            'id'              => (string)$r['id'],
            'currency'        => $r['currency'],
            'direction'       => $r['direction'],
            'type'            => $r['type'],
            'department'      => $r['department'] ?? '',
            'description'     => $r['description'] ?? '',
            'submitter'       => $r['submitter_name'] ?? '',
            'approver'        => $r['approver_name'] ?? '',
            // 截到秒：PG 时间戳带微秒，前端直接展示会出现 05:37:51.675665
            'operationTime'   => substr((string)$r['created_at'], 0, 19),
            'amount'          => (float)$r['amount'],
            'remainingAmount' => (float)$r['remaining_amount'],
            'status'          => $r['status'],
            'settlements'     => $settlements,
            'borrower'        => $r['borrower'],
            'repaymentDate'   => $r['repayment_date'],
        ];
    }

    public function getLoan(int $id, int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT l.*, d.name AS department,
                   su.full_name AS submitter_name, au.full_name AS approver_name
            FROM loans l
            LEFT JOIN departments d ON l.department_id = d.id
            LEFT JOIN users su      ON l.submitter_id  = su.id
            LEFT JOIN users au      ON l.approver_id   = au.id
            WHERE l.id = ? AND l.project_id = ?
        ");
        $stmt->execute([$id, $projectId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new \RuntimeException('借贷记录不存在');
        return $this->toApiShape($row, $this->findSettlements([$id])[$id] ?? []);
    }

    public function create(array $d): array {
        if (empty($d['type']) || !in_array($d['type'], self::TYPES, true)) {
            throw new \InvalidArgumentException('借贷类型无效');
        }
        $amount = (float)($d['amount'] ?? 0);
        if ($amount <= 0)               throw new \InvalidArgumentException('金额必须大于0');
        if ($amount > 999999999.99)     throw new \InvalidArgumentException('金额超出有效范围');

        // 方向可由类型推导：收款/借出为借出方向，付款/借入为借入方向
        $direction = $d['direction'] ?? (in_array($d['type'], ['应收款','预付款','押金','借出'], true) ? '借出' : '借入');
        if (!in_array($direction, ['借出','借入'], true)) {
            throw new \InvalidArgumentException('借贷方向无效');
        }
        if (!empty($d['department_id'])) {
            $this->assertBelongsToProject('departments', (int)$d['department_id'], (int)$d['project_id'], '部门');
        }

        $stmt = $this->db->prepare("
            INSERT INTO loans
                (project_id, type, direction, currency, amount, remaining_amount,
                 borrower, repayment_date, description, department_id, status, submitter_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
        ");
        $stmt->execute([
            $d['project_id'], $d['type'], $direction, $d['currency'] ?? 'CNY',
            $amount, $amount,
            $d['borrower'] ?? null, $d['repayment_date'] ?? null,
            $d['description'] ?? null, $d['department_id'] ?? null,
            $d['status'] ?? '待审批', $d['submitter_id'] ?? null,
        ]);
        $id = (int)$stmt->fetchColumn();

        $this->logActivity('create', $id,
            sprintf('新增%s %.2f', $d['type'], $amount), $d['submitter_id'] ?? null, (int)$d['project_id']);
        return $this->getLoan($id, (int)$d['project_id']);
    }

    /** 结算：递减未结金额并留痕 */
    public function settle(int $id, int $projectId, array $d, array $user): array {
        $amount = (float)($d['amount'] ?? 0);
        if ($amount <= 0) throw new \InvalidArgumentException('结算金额必须大于0');

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("SELECT * FROM loans WHERE id = ? AND project_id = ? FOR UPDATE");
            $stmt->execute([$id, $projectId]);
            $loan = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$loan) throw new \RuntimeException('借贷记录不存在');

            $remaining = (float)$loan['remaining_amount'];
            // 用整数分比较，规避浮点误差
            if ((int)round($amount * 100) > (int)round($remaining * 100)) {
                throw new \InvalidArgumentException(sprintf(
                    '结算金额 %.2f 超过未结金额 %.2f', $amount, $remaining
                ));
            }

            $this->db->prepare(
                "INSERT INTO loan_settlements (loan_id, project_id, amount, description, operator_id)
                 VALUES (?,?,?,?,?)"
            )->execute([$id, $projectId, $amount, $d['description'] ?? null, $user['id'] ?? null]);

            $newRemaining = round($remaining - $amount, 2);
            $this->db->prepare(
                "UPDATE loans SET remaining_amount = ?, status = ?, updated_at = NOW() WHERE id = ?"
            )->execute([$newRemaining, $newRemaining <= 0 ? '已完成' : $loan['status'], $id]);

            $this->logActivity('settle', $id,
                sprintf('结算 %.2f，剩余 %.2f', $amount, $newRemaining), $user['id'] ?? null, $projectId);

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getLoan($id, $projectId);
    }

    public function delete(int $id, int $projectId, array $user): void {
        $stmt = $this->db->prepare("DELETE FROM loans WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        if (!$stmt->rowCount()) throw new \RuntimeException('借贷记录不存在');
        $this->logActivity('delete', $id, sprintf('删除借贷记录 #%d', $id), $user['id'] ?? null, $projectId);
    }

    private function assertBelongsToProject(string $table, int $id, int $projectId, string $label): void {
        $stmt = $this->db->prepare("SELECT 1 FROM $table WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        if (!$stmt->fetch()) throw new \InvalidArgumentException($label . '不存在或不属于当前项目');
    }

    private function logActivity(string $action, int $targetId, string $desc, ?int $userId, int $projectId): void {
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id)
             VALUES (?, 'loans', ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetId, $desc, $userId, $projectId]);
    }
}
