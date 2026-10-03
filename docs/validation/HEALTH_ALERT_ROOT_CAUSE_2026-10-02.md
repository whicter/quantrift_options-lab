# 采集器 degraded 告警的三层根因 — 2026-10-02

日期：2026-10-02
告警：`覆盖 308/316(97.47%)；缺失 8、不完整 2；24 小时内 42 个任务失败（阈值 25）`
指纹：`5c540865`，每小时重复

只读诊断先行，结论是三件互不相干的事被同一条告警裹在一起，其中一件是**真 bug**，
而且它和本次告警毫无关系——是查的时候撞见的。

---

## 先把告警本身读准：触发它的不是"缺失 8"

用生产数据只读复跑 `evaluate_health`，输出与告警逐字一致：

```
coverage 97.47  missing 8  incomplete 2  stale 0  failed 42
issue codes: ['failed_jobs_above_threshold']      ← 只有这一条
fingerprint: 5c540865
```

- 覆盖 97.47% **高于** `HEALTH_MIN_COVERAGE_PCT=95` → 没触发
- 不完整 2/308 = 0.65% **低于** `HEALTH_MAX_INCOMPLETE_PCT=2` → 没触发（09-24 的比例制改动在起作用）
- 过期 0 → 没触发

**唯一触发的是失败数 42 > 25。** 正文里的"缺失 8、不完整 2"只是报告的描述字段。
一条告警把三个不相关的量印在一起，读的人自然会以为缺失是原因——这本身是个表达问题。

指纹也不是"缺失标的组合"的指纹：

```
sha256(["failed_jobs_above_threshold"])  = 5c540865   ← 就是它
sha256(["completeness_below_threshold"]) = 4a993106
```

每小时重复是 09-23 改动的**设计行为**：同一件事持续存在，按 60 分钟冷却提醒一次。

---

## 第一层：42 次失败 = 15 次结构性噪声 + 27 次真实事件

```
15 × Polygon prev agg returned no results for VIX        (chain 道)
27 × IB 相关，全部集中在 14:00–15:10 UTC 这 70 分钟      (quote 道)
      3 × IB connection timed out 127.0.0.1:4001 client_id=42 (error 502)
     24 × option params / contract details timed out，17 个标的
```

十天趋势暴露了地板：

```
10-02   42   (VIX 15 + IB 27)   ← 越线
10-01   15   (VIX 15)
09-30   14   (VIX 14)
09-29   15   (VIX 15)
```

**VIX 每天稳定失败 14–15 次，占掉 25 阈值的 60%，真实故障只剩 10 的余量。**

VIX 不在 `watchlist.txt`，但在 `symbol_universe` 里 `active=TRUE, scan_enabled=FALSE`
→ 落进 `cold_backfill` 层仍被调度。它是指数，Polygon 没有 prev agg。
历史统计：**失败 451 次，成功 10 次**（最后一次成功 2026-08-28，产出早已被 prune），
现存 `option_chain_snapshots` 0 行。

为什么它每轮都抢得到位置，`schedule_option_refresh.py` 的注释早有记载：
从未产出快照的标的没有 `snapshot_ts`，排序时等同"从未采集"，排在所有"有快照只是旧了"
的标的前面，每个 30 分钟冷却窗口都会重新夺位。

IB 那 70 分钟是真实断连，`502 Couldn't connect` 是源头，24 个超时是下游症状。
已自愈：之后 197 个 quote job 成功。

**这条告警本来就会自己消失**——27 个 IB 失败在滚动 24 小时窗口里滑出后计数回到 ~15 < 25。

---

## 第二层：失败数被池化，一条通道的噪声吃掉另一条的预算

`load_health_state` 原本只查一个总数，**不分 job_type**。于是：

- Polygon chain 道持续故障 和 IB quote 道抖一下，算出来是同一个数字
- VIX 的 15 次噪声让 quote 道只要失败 11 次就越线

**已改为按通道分别计数**，每条通道各自对阈值比较，告警正文点名是哪条通道。
`job_type` 也加入了指纹——否则 chain 道已在告警时 quote 道再出事，
会被并进同一个未解决事件，操作者永远收不到通知。

阈值 `HEALTH_MAX_FAILED_24H=25` **本次不动**。去掉 VIX 噪声和改成按通道计数
已经是两处变更，再动阈值会让下一次测量无法归因。

---

## 第三层（与本告警无关的真 bug）：行权价窗口会整个掉进两档之间

8 个"缺失"标的全部 `active=TRUE, scan_enabled=TRUE`，**今天都在被成功采集**
（各 17–18 次快照，最新均为 10-02），只是每次 `contract_count=0`、
`provider_status='empty'`。不是限流、不是发现失败、不是同一时段。

直接问 Polygon 它们到底有没有挂牌合约：

```
API : 24 个合约，行权价 2.5 / 5 / 7.5     ← 有期权
ZH  : 24 个合约，行权价 2.5 / 5 / 7.5     ← 有期权
LINK: 0 个合约                            ← 对照组，真没有
```

API 现价 $4.14，`OPTION_STRIKE_WINDOW_PCT=15` 算出 `[3.519, 4.761]`，
**整个落在 2.5 和 5 这两档之间**，一个行权价都框不住 → 永远返回空。

**成因是两种度量混用**：窗口按现价**成比例**，行权价间距由交易所按**绝对美元**定。
低价股上窗口宽度 `0.30 × spot` 会小于行权价间距，于是窗口整个掉进缝里。
$2.50 间距要求 spot ≥ $8.33 才能保证命中。

这和 `docs/CLAUDE.md` 里记的 `total_oi` 偏斜是同一种几何问题的两端：
那条讲高价股被 ±5% 窗口挤出去，这条讲低价股被 ±15% 窗口漏掉。

最糟的地方在于**它和"这个标的没有期权"完全无法区分**——而后者也是真实状态
（watchlist 里 6 个标的确实没挂期权）。两种情况在所有报告里长得一模一样。

### 修法

窗口化抓取**整体为空时**，按标的重试一次，去掉 strike 过滤、保留到期区间、只取一页。
下游 `_apply_strike_limit` 本来就会裁到现价附近，所以这条路径不可能撑大正常的链——
窗口里有合约的标的根本走不到这里。结果写进 `raw_metadata.strike_window_missed`，
**这正是区分"窗口框空"和"没有挂牌"的那一位**。

对照成本：6 个真无期权的标的每轮多一次返回 0 的请求，换来的是这 6 个从此被确证
而不是被怀疑。

实测（接生产 Polygon，未写库）：

```
API: strike window [3.468, 4.692] around spot 4.08 contained no listed strike;
     refetched 18 contracts without it
```

---

## 已执行

| | 动作 |
|---|---|
| A | `symbol_universe` 退役 VIX（`active=FALSE, scan_enabled=FALSE`），active 324 → 323 |
| B | 失败数按 `job_type` 分通道计数 + 入指纹 + 告警正文点名通道 |
| C | 行权价窗口为空时按标的重试一次（无 strike 过滤），结果记入 `strike_window_missed` |

不做：补采那 8 个。6 个真没期权，补了还是空；API/ZH 在 C 生效后下一轮自然补上。

## 复现

```bash
cd collector

# 只读复跑健康报告
venv311/bin/python - <<'PY'
import sys; sys.path.insert(0,'.')
from dotenv import load_dotenv; load_dotenv('.env')
import os, psycopg2
from common import load_watchlist
import check_collector_health as h
from datetime import datetime, timezone
conn = psycopg2.connect(os.environ['DATABASE_URL'])
latest, failed = h.load_health_state(conn, load_watchlist())
rep = h.evaluate_health(load_watchlist(), latest, failed,
                        datetime.now(timezone.utc), h.thresholds_from_env())
print(rep['coverage_pct'], rep['failed_by_type_24h'], [i['code'] for i in rep['issues']])
print(h.alert_fingerprint(rep)[:8])
conn.rollback(); conn.close()
PY

# 标的到底有没有挂牌合约（reference scope，只读）
#   GET /v3/reference/options/contracts?underlying_ticker=API&expired=false

# 单测
venv311/bin/python -m unittest discover -s tests      # 581 passed
```
