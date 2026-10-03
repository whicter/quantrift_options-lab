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

阈值 `HEALTH_MAX_FAILED_24H=25` **不动**。去掉 VIX 噪声和改成按通道计数
已经是两处变更，再动阈值会让下一次测量无法归因。

### 第二层的补丁没够：24 小时计数有 24 小时的尾巴

按通道计数上线后告警仍然每小时响。看实际分布：

```
10-03 02:52 UTC
option_quote_snapshot : 24h 内 27 次，近 6 小时 0 次，最后一次在 11.7 小时前
option_chain_snapshot : 24h 内 15 次，近 2 小时 0 次，最后一次在  5.9 小时前
```

**什么都没有在失败。** 那场 IB 断连 10-02 15:10 UTC 就结束了，而推送一直响到
10-03 02:51 —— 因为一次突发把 24 小时滚动计数顶过线之后，它会**整整保持越线 24 小时**，
与当前是否还在坏毫无关系。这个指标回答的是"今天出过事吗"，
而操作者被叫醒要回答的是"现在正在坏吗"。两者不是一回事。

修法不是缩短窗口（那会让"全天零星失败"的慢性问题逃掉），
而是**加一个必须同时成立的条件**：该通道在最近 `HEALTH_FAILURE_RECENCY_MINUTES`（60）
分钟内还有失败。24 小时计数继续作为量级报告，只是不再单独构成升级理由。

附带收益：突发自愈后 `issues` 变空，`record_report` 的批量 resolve 分支随之触发，
之前那些因为指纹变化而滞留的 `active` 行也被一并关掉。

生产数据只读试算（部署前）：

```
24h 各通道失败 : {'option_chain_snapshot': 15, 'option_quote_snapshot': 27}
最近 60 分钟   : {'option_chain_snapshot': 0,  'option_quote_snapshot': 0}
status         : ok     issues: []
```

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

---

## 把四条规则一次过完：触发条件必须等于"我该去做什么"

前面三轮都是哪里响修哪里。两周内这个告警系统因为**同一个毛病**吵了四次，
所以最后一轮不按症状走，把每条规则都按同一句话审一遍：
**收到这条我应该去做什么？做不了的，就不该响。**

| 规则 | 原触发条件 | 审出的问题 | 处理 |
|---|---|---|---|
| `coverage_below_threshold` | `coverage < 95%` | 分母含 6 个永远不可能有期权的标的，天花板锁死 97.47% —— 测的是 watchlist 的构成，不是采集器 | 证实无挂牌期权的标的**移出分母**，单列 `unlisted` 上报 |
| `snapshot_age_above_threshold` | **`if stale:` 任意一个** | 2.1 小时扫一轮 vs 180 分钟阈值，轮转中总有几个刚过线 —— 这是采集器**正常工作**的样子 | 改比例制 `HEALTH_MAX_STALE_PCT=20` |
| `failed_jobs_above_threshold` | 池化总数 / 24h | 见上两节 | 按通道 + 最近 60 分钟 |
| `completeness_below_threshold` | 任意一个标的 | 09-24 已修 | 比例制 `HEALTH_MAX_INCOMPLETE_PCT=2` |

### 覆盖率测错了东西

"证实无挂牌期权"现在是**可证明的事实**，不再是推测：C 的无过滤重试跑完还是空，
就写 `raw_metadata.no_listed_contracts=true`。健康检查据此把这些标的移出分母，
`expected_count` 变成"**可能**有链的标的数"。

它们仍然计数上报（`unlisted_count` / `unlisted_symbols`），所以这个数突然跳动依然看得见。
只有**被证明**缺席的才豁免——"库里没有这一行"仍然算 missing，那是真的采集故障。

注意这需要观测，不能回填：旧快照没有这个字段，所以要等各标的在新代码下刷新一轮
（下一个交易日）才会归位。预期 missing 8 → 0、unlisted 0 → 6。

### 告警正文把原因和上下文分开

今天这条告警最大的代价不是它响了，是它**把人引到错误的方向**：正文第二行印着
"缺失 8，不完整 2"，而真正触发它的是第三行。每个读到的人（包括写规则的我）
都先去查那 8 个标的。

**告警里的每个数字都会被当成证据。** 正文现在是：

```
触发原因：
• 24 小时内 option_quote_snapshot 27 个任务失败（阈值 25），最近 1 小时 4 个
其余为上下文，未触发告警：缺失 2，不完整 2，无挂牌期权 6
```

原因在上并标明是原因；没参与触发的数字在下并标明是上下文。
"最近 1 小时 N 个"让"还在坏"和"几小时前就好了"一眼可分。

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
