<?php
/**
 * 汇率
 *
 * 存储口径统一以 USD 为锚：rate_to_usd = 1 单位该币种折合多少 USD。
 * 用户在顶栏选择的展示本位币只决定换算目标，不影响存储。
 *
 * 失效规则：
 *   - USD 是锚，恒为 1，永不失效
 *   - 自动模式：由定时拉取维持新鲜度，同样受 valid_hours 约束，
 *     取不到报价时不沿用旧值，而是让它自然过期
 *   - 手动模式：超过 valid_hours 未更新即失效
 * 失效的币种不参与任何换算，调用方须显式处理，不得退回旧值。
 */
class ExchangeRateService {
    private PDO $db;

    /** 免费公开报价，无需密钥 */
    private const PROVIDER_URL = 'https://open.er-api.com/v6/latest/USD';

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    /**
     * 汇率变动必须留痕。
     * 汇率直接决定所有换算出来的金额，改一个数字就能让报表面目全非，
     * 事后却查不到是谁在什么时候改的 —— 这类操作恰恰最需要审计。
     */
    private function logActivity(string $action, int $targetId, string $description, ?int $userId, int $projectId): void {
        if ($projectId <= 0) return;
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id)
             VALUES (?, 'currency_types', ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetId, $description, $userId, $projectId]);
    }

    /** 拉取失败后的冷却，避免报价源故障时每次请求都去重试并拖慢页面 */
    private const FAIL_COOLDOWN = 600;
    private const FAIL_FLAG = '/tmp/oa-exchange-rate-fail';

    /**
     * @param bool $autoRefresh 读取时顺带补齐已过期的自动汇率。
     *   自动模式若只靠外部定时器维持，定时器一停就全线失效且无人察觉；
     *   在读取路径上兜底，能保证「打开了开关就一直有值」。
     */
    public function listRates(int $projectId, bool $autoRefresh = true): array {
        if ($autoRefresh && $this->hasStaleAuto($projectId) && !$this->inFailCooldown()) {
            $r = $this->refreshAuto($projectId);
            if (!empty($r['failed'])) {
                @touch(self::FAIL_FLAG);
            }
        }
        $stmt = $this->db->prepare(
            "SELECT id, name, code, description, rate_to_usd, auto_fetch, valid_hours,
                    rate_updated_at, rate_source
             FROM currency_types WHERE project_id = ? ORDER BY id"
        );
        $stmt->execute([$projectId]);
        return array_map([$this, 'shape'], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /**
     * 自动模式的取价节奏：与 valid_hours 无关（那是手动维护的失效期），
     * 只是为了不对报价源发起过于频繁的请求。超过这个间隔就在下次读取时顺带刷新。
     */
    private const AUTO_REFRESH_INTERVAL = 1800;

    /** 是否存在「开了自动获取但该重新取价」的币种 */
    private function hasStaleAuto(int $projectId): bool {
        $stmt = $this->db->prepare(
            "SELECT rate_to_usd, rate_updated_at
             FROM currency_types
             WHERE project_id = ? AND auto_fetch = TRUE AND code <> 'USD'"
        );
        $stmt->execute([$projectId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if ($row['rate_to_usd'] === null || $row['rate_updated_at'] === null) return true;
            if (time() - strtotime($row['rate_updated_at']) >= self::AUTO_REFRESH_INTERVAL) return true;
        }
        return false;
    }

    private function inFailCooldown(): bool {
        $t = @filemtime(self::FAIL_FLAG);
        return $t !== false && (time() - $t) < self::FAIL_COOLDOWN;
    }

    private function shape(array $r): array {
        $expired = $this->isExpired($r);
        return [
            'id'            => (string)$r['id'],
            'name'          => $r['name'],
            'code'          => $r['code'],
            'description'   => $r['description'] ?? '',
            'rateToUsd'     => $r['rate_to_usd'] !== null ? (float)$r['rate_to_usd'] : null,
            'autoFetch'     => (bool)$r['auto_fetch'],
            'validHours'    => (int)$r['valid_hours'],
            'rateUpdatedAt' => $r['rate_updated_at'] ? substr((string)$r['rate_updated_at'], 0, 19) : null,
            'rateSource'    => $r['rate_source'],
            'isAnchor'      => $r['code'] === 'USD',
            'isExpired'     => $expired,
            'expiresAt'     => $this->expiresAt($r),
            // 前端倒计时用服务端算好的剩余秒数：
            // 服务器时间戳不带时区，交给浏览器解析会按浏览器本地时区算，产生数小时偏差
            'expiresInSeconds' => $this->expiresInSeconds($r),
        ];
    }

    /**
     * 失效只针对手动维护。
     *   - USD 是锚，恒为 1
     *   - 自动模式由系统持续从公开报价刷新，只要取到过值就一直可用，
     *     不设有效期（valid_hours 对它无意义）
     *   - 手动模式超过 valid_hours 未更新即失效
     * 任何模式下从未取到过汇率，都算不可用。
     */
    private function isExpired(array $r): bool {
        if ($r['code'] === 'USD') return false;
        if ($r['rate_to_usd'] === null || $r['rate_updated_at'] === null) return true;
        if ((bool)$r['auto_fetch']) return false;
        $deadline = strtotime($r['rate_updated_at']) + ((int)$r['valid_hours'] * 3600);
        return time() > $deadline;
    }

    /** 距失效还有多少秒；已失效为 0；锚定币、自动模式、从未维护过均为 null（不倒计时） */
    private function expiresInSeconds(array $r): ?int {
        if ($r['code'] === 'USD' || (bool)$r['auto_fetch']) return null;
        if (!$r['rate_updated_at'] || $r['rate_to_usd'] === null) return null;
        $left = strtotime($r['rate_updated_at']) + ((int)$r['valid_hours'] * 3600) - time();
        return $left > 0 ? $left : 0;
    }

    private function expiresAt(array $r): ?string {
        if ($r['code'] === 'USD' || (bool)$r['auto_fetch'] || !$r['rate_updated_at']) return null;
        return date('Y-m-d H:i:s', strtotime($r['rate_updated_at']) + ((int)$r['valid_hours'] * 3600));
    }

    // ==================== 维护 ====================

    public function updateSettings(int $id, int $projectId, array $d, ?int $userId = null): array {
        $stmt = $this->db->prepare("SELECT * FROM currency_types WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        $cur = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$cur) throw new \RuntimeException('币种不存在');

        if ($cur['code'] === 'USD') {
            throw new \InvalidArgumentException('USD 为基准币种，汇率固定为 1，无需维护');
        }

        $sets = [];
        $params = [];

        if (array_key_exists('autoFetch', $d)) {
            $sets[] = 'auto_fetch = ?';
            // PDO 把 PHP false 绑成空字符串，boolean 列会报 invalid input syntax
            $params[] = ((bool)$d['autoFetch']) ? 'true' : 'false';
        }
        if (array_key_exists('validHours', $d)) {
            $h = (int)$d['validHours'];
            if ($h < 1 || $h > 8760) {
                throw new \InvalidArgumentException('有效期必须在 1 到 8760 小时之间');
            }
            $sets[] = 'valid_hours = ?';
            $params[] = $h;
        }
        // 手动填写汇率：同时刷新时间戳，重新开始计算有效期
        if (array_key_exists('rateToUsd', $d) && $d['rateToUsd'] !== null && $d['rateToUsd'] !== '') {
            $rate = (float)$d['rateToUsd'];
            if (!is_finite($rate) || $rate <= 0) {
                throw new \InvalidArgumentException('汇率必须大于 0');
            }
            $sets[] = 'rate_to_usd = ?';   $params[] = $rate;
            $sets[] = 'rate_updated_at = NOW()';
            $sets[] = "rate_source = 'manual'";
        }

        if (!$sets) throw new \InvalidArgumentException('没有需要更新的内容');

        $params[] = $id;
        $params[] = $projectId;
        $this->db->prepare(
            'UPDATE currency_types SET ' . implode(', ', $sets) . ' WHERE id = ? AND project_id = ?'
        )->execute($params);

        $after = $this->findOne($id, $projectId);
        $parts = [];
        if (array_key_exists('rateToUsd', $d) && $d['rateToUsd'] !== null && $d['rateToUsd'] !== '') {
            $parts[] = sprintf('汇率 %s → %s',
                $cur['rate_to_usd'] === null ? '未维护' : rtrim(rtrim((string)$cur['rate_to_usd'], '0'), '.'),
                rtrim(rtrim((string)$after['rateToUsd'], '0'), '.'));
        }
        if (array_key_exists('autoFetch', $d)) {
            $parts[] = ((bool)$d['autoFetch'] ? '改为自动获取' : '改为手动维护');
        }
        if (array_key_exists('validHours', $d)) {
            $parts[] = sprintf('有效期 %d 小时', (int)$d['validHours']);
        }
        $this->logActivity('update', $id,
            sprintf('维护币种「%s」：%s', $after['code'], $parts ? implode('，', $parts) : '无变化'),
            $userId, $projectId);

        return $after;
    }

    public function findOne(int $id, int $projectId): array {
        $stmt = $this->db->prepare(
            "SELECT id, name, code, description, rate_to_usd, auto_fetch, valid_hours,
                    rate_updated_at, rate_source
             FROM currency_types WHERE id = ? AND project_id = ?"
        );
        $stmt->execute([$id, $projectId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new \RuntimeException('币种不存在');
        return $this->shape($row);
    }

    // ==================== 自动拉取 ====================

    /**
     * 从公开报价刷新所有开启自动获取的币种。
     * @return array{updated:string[], failed:array<string,string>}
     */
    public function refreshAuto(int $projectId, ?int $userId = null): array {
        $stmt = $this->db->prepare(
            "SELECT id, code FROM currency_types
             WHERE project_id = ? AND auto_fetch = TRUE AND code <> 'USD'"
        );
        $stmt->execute([$projectId]);
        $targets = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$targets) return ['updated' => [], 'failed' => []];

        $quotes = $this->fetchQuotes();
        if ($quotes === null) {
            // 拉取失败不写入任何值：宁可让汇率自然过期，也不能留下来源不明的数字
            return ['updated' => [], 'failed' => array_fill_keys(
                array_column($targets, 'code'), '无法连接汇率服务'
            )];
        }

        $upd = $this->db->prepare(
            "UPDATE currency_types
             SET rate_to_usd = ?, rate_updated_at = NOW(), rate_source = 'auto'
             WHERE id = ?"
        );
        $updated = []; $failed = [];
        foreach ($targets as $t) {
            $code = $t['code'];
            // 报价以 USD 为基准给出「1 USD = N 外币」，需取倒数得到「1 外币 = ? USD」
            if (!isset($quotes[$code]) || (float)$quotes[$code] <= 0) {
                $failed[$code] = '报价源中没有该币种';
                continue;
            }
            $upd->execute([1 / (float)$quotes[$code], (int)$t['id']]);
            $updated[] = $code;
        }
        if ($updated) @unlink(self::FAIL_FLAG);
        if ($userId !== null && ($updated || $failed)) {
            $this->logActivity('refresh', 0, sprintf(
                '刷新自动汇率：成功 %s%s',
                $updated ? implode('、', $updated) : '无',
                $failed ? '；失败 ' . implode('、', array_keys($failed)) : ''
            ), $userId, $projectId);
        }
        return ['updated' => $updated, 'failed' => $failed];
    }

    private function fetchQuotes(): ?array {
        $ctx = stream_context_create(['http' => ['timeout' => 5, 'method' => 'GET']]);
        $raw = @file_get_contents(self::PROVIDER_URL, false, $ctx);
        if ($raw === false) return null;
        $json = json_decode($raw, true);
        if (!is_array($json) || ($json['result'] ?? '') !== 'success' || empty($json['rates'])) {
            return null;
        }
        return $json['rates'];
    }

    // ==================== 换算 ====================

    /**
     * 把各币种金额换算到目标币种。
     * 任一涉及的币种汇率失效时抛出异常 —— 调用方必须显式呈现「汇率已失效」，
     * 不允许用过期汇率或直接跳过某个币种，那会让总额悄悄失真。
     *
     * @param array<string,float> $amountsByCurrency
     */
    public function convertTotal(array $amountsByCurrency, string $targetCode, int $projectId): float {
        $rates = [];
        foreach ($this->listRates($projectId, false) as $c) {
            $rates[$c['code']] = $c;
        }

        $targetRate = $rates[$targetCode] ?? null;
        if (!$targetRate || $targetRate['isExpired'] || !$targetRate['rateToUsd']) {
            throw new \RuntimeException("本位币 {$targetCode} 的汇率已失效，请先在币种配置中更新");
        }

        $totalUsd = 0.0;
        foreach ($amountsByCurrency as $code => $amount) {
            if ((float)$amount == 0.0) continue;   // 金额为 0 不需要汇率
            $c = $rates[$code] ?? null;
            if (!$c || $c['isExpired'] || !$c['rateToUsd']) {
                throw new \RuntimeException("{$code} 的汇率已失效，请先在币种配置中更新");
            }
            $totalUsd += (float)$amount * $c['rateToUsd'];
        }
        return round($totalUsd / $targetRate['rateToUsd'], 2);
    }
}
