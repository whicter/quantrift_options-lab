# 日线落后一个交易日、以及吞吐的真实瓶颈 — 2026-09-17

日期：2026-09-17
影响：盘中 80% 的标的用的是**两个 session 前**的收盘价；期权链刷新吞吐只有配置意图的一半

两件独立的事，都是"配置里写着的假设"和"provider 实际行为"对不上。

---

## 一、日线：一个写在注释里的错误假设

### 现象

2026-09-17 盘中（15:13 ET），最新一批 scanner 快照：

```
price_date     行数
2026-09-16      52
2026-09-15     264      ← 80%，落后两个 session
(null)          11
```

`price_history` 里 2026-09-16 只有 52/319 个标的有 bar。

### 这 52 个是谁

```
首字母  U:5  V:18  W:6  X:19  Y:1  Z:3        合计 52，无一例外
```

字母表最后一段。`collect_prices` 按字母序跑，`POLYGON_STOCK_REQUEST_DELAY=16`
配 322 个标的 × 2 个请求（daily + 30m），一轮 2 小时 55 分。

写入时间戳给出精确切点：

```
09-16 那批 daily bar 第一条写入   21:00:21 PT = 00:00:21 ET
                    最后一条写入   21:27:33 PT
```

18:35 PT 开跑的那一轮**横跨 00:00 ET**。切点之前抓的（A–T）一根没有，之后抓的（U–Z）全有。

十个交易日完全同形：

```
bar_date     当天写入   次日才写入
2026-09-15      54         262
2026-09-14      52         263
2026-09-11      52         263
2026-09-10      52         264
```

### 假设写在哪

`collector/ecosystem.config.cjs`：

> Two weekday runs: 13:35 PT (~35 min after the 16:00 ET close, **may miss a
> still-pending EOD bar**) and 18:35 PT (= 21:35 ET, **past the EOD settle**)

`collect_prices.py`：`PRICE_EOD_SETTLE_HOUR_ET = 20`。

两处都断定 21:35 ET 已过结算点。

### provider 自己说了不是

直接问 Polygon（2026-09-17 17:07 ET，收盘后 67 分钟）：

```
GET /v2/aggs/grouped/locale/us/market/stocks/2026-09-17
→ 403 {"status":"NOT_AUTHORIZED",
       "message":"Attempted to request today's data before end of day.
                  Please upgrade your plan at https://polygon.io/pricing"}

GET /v2/aggs/grouped/locale/us/market/stocks/2026-09-16
→ 200 OK, 12562 tickers
   AAPL  o=332.53 h=335.48 l=330.7 c=332.41 v=35981000
   BRK.B o=516.36 h=523.74 l=515.3 c=519.8  v=5258519
```

同一时刻 per-symbol aggregates 也一样，AAPL 最新 bar 仍是 09-16。

**不是"发布慢"，是套餐条款**：当前 session 在它自己 end-of-day 之前一律拒绝，
而那个 end-of-day 经实测落在 ~00:00 ET，也就是**下一个 ET 日历日**。
`PRICE_EOD_SETTLE_HOUR_ET=20` 在 20:00–24:00 ET 这个窗口里是错的，
而 18:35 PT 的那一轮正好整个落在这个窗口里——于是它每晚要求一份谁也拿不到的数据，
再把结果报成 `price freshness: 270/322 symbols behind`。

这条 WARNING 一直在报，而且报的是对的；被忽略是因为另一轮（13:35 PT）同时在报
`6/322 behind`，两个数字来自同一个日志、说的却是不同的 expected date。

### 改法

日线改走 grouped daily（`providers/polygon_price_provider.py::fetch_grouped_daily`）：
一次请求返回全市场当日 OHLCV，我们的 316 个标的是其中子集。

这不只是快，是**不可切分**：一个 session 要么对所有标的落地、要么一个都没有，
结果不再取决于标的排在字母表哪里、也不取决于那一轮跑多久。

`collect_prices.run()` 现在两段：

1. **grouped 填充**最近 `PRICE_GROUPED_DAILY_SESSIONS`（5）个可取 session，几次请求搞定；
   被拒的 session 记 WARNING 跳过，不中断——窗口里更老的 session 仍然值得写。
2. **per-symbol** 仍然抓 30m，但 400 天 daily 只对 `symbols_needing_history()` 选出的标的抓。

第 2 步省掉的是每标的一个 daily 请求，在 16s 间隔下正好是每个标的一半的成本。

`PRICE_EOD_SETTLE_HOUR_ET` 默认 20 → **24**。小时只有 0..23，24 恰好表达
"session 永远不在它自己的 ET 日期上可取"。

### 哪些标的仍需全量回补

`symbols_needing_history()` 只在三种情况下花那个请求：

1. 库里一条都没有——grouped 只写最近窗口，新标的没有历史可延长。
2. 最新 bar 早于本次填充的最老 session——中间有 grouped 够不到的洞。
3. **窗口内出现拆股量级的收盘跳变**（`PRICE_SPLIT_RATIO_THRESHOLD=0.25`）。
   grouped 的 bar 只按它自己那个 session 复权，所以拆股会把一段未复权的历史
   接在一根已复权的 bar 上——这个不连续会静默毁掉建在上面的每一条均线。
   真实大幅波动也会触发，代价是一次多余请求，不改变任何值。

### 仍然改不掉的部分，以及答案早就在仓库里

session D 的收盘价在 D+1 的 end-of-day gate 打开之前拿不到，这是套餐决定的。
所以要让 D 的收盘价在 **D+1 盘中**就位，必须有一轮跑在 gate 之后——
现有的 13:35 / 18:35 PT 两轮都在之前，两轮都只能拿到 D-1。

**这个实验一个月前就做了，结果一直躺在日志里没人读。** `ecosystem.config.cjs` 里
breadth 那条线的注释写着：

> measured 2026-08-14, both the 20:05 and 22:05 runs took a 403 on that session
> and settled on the prior one [...] The 06:05 run exists to find out whether
> Polygon publishes overnight. [...] Read `settled on` in the log to tell which:
> a morning line with no `skipping` means D-1 was available.

同一个 grouped 端点。读日志：

```
09-10 03:05 PT (06:05 ET) → market_date 2026-09-09   universe 5151
09-11 03:05               → market_date 2026-09-10   universe 5186
09-14 03:05               → market_date 2026-09-11   universe 5158
09-15 03:05               → market_date 2026-09-14   universe 5206
09-16 03:05               → market_date 2026-09-15   universe 5191
09-17 03:05               → market_date 2026-09-16   universe 5172
```

**凌晨那班每天都拿到 D-1**，连续两周无一例外。

第一次查这个问题时我 grep 的是 `settled on`，得到"09-09 之后就没有凌晨 run 了"的错误印象——
因为那行**只在需要回退时才打**，干净成功打的是 `Full-market breadth complete`。
注释里其实写明了判读方法（"a morning line with no `skipping` means D-1 was available"），
是我按自己的猜测去 grep，而不是按它说的去读。

于是 cron 改法从「18:35 → 21:35 PT」改成**「18:35 → 03:35 PT」**：

```
cron_restart: '35 13,18 * * 1-5'  →  '35 3,13 * * 1-5'
```

03:35 PT = 06:35 ET，是**同一端点上已被连续两周证明**的时刻，而 00:35 ET 只有
per-symbol aggregates 的间接证据（U–Z 那批 bar 写在 00:00–00:27 ET）。
跑完约 05:02 PT = 08:02 ET，早于 09:30 ET 开盘，所以 D 的收盘价在 D+1 盘中就位。
周一 03:35 PT 取到的是上周五，没有 session 会被跳过。

属参数改动，**尚未执行，待确认**。

### 生产验证（09-17 上线，09-23 回看 6 天）

代码 09-17 落盘后由 13:35 / 18:35 PT 两班自动带上，未改任何环境变量。

**字母表切分消失了。** `price_history` 按 bar_date 统计写入时刻：

```
bar_date     当天写入   次日才写入        
2026-09-21        0         315      ← 改后
2026-09-18        0         315      ← 改后
2026-09-17        0         316      ← 改后
2026-09-16       52         263      ← 改前
2026-09-15       54         262      ← 改前
2026-09-14       52         263      ← 改前
```

改后是干净的 all-or-nothing，正是 grouped 的保证；改前那个 52/263 的分裂不再出现。

**其余实测：**

```
2026-09-22 13:35:04  grouped daily 2026-09-15: 316/316 symbols from 12589 tickers
            ...5 个 session，总耗时约 2 分钟（原逐标的扫描 2h55m）
2026-09-22 13:37:10  grouped daily covered 5/5 sessions;
                     1/316 symbols still need a full history fetch
2026-09-22 20:02:12  price freshness: 1/316 symbols behind expected 2026-09-21;
                     sample=['NOEM']
2026-09-22 20:02:12  === Done: daily=1977; 30m=184497; 0 symbols failed ===
```

- `1/316 still need a full history fetch` —— 回补收窄按预期工作，绝大多数标的不再付那个 400 天请求。
- `price freshness` 从改前的 **270/322** 降到 **1/316**，剩下的 NOEM 是本记录第三节里那个"真实但当日无成交"的标的，不是缺陷。
- `0 symbols failed` —— 退掉 6 个 404 ticker 之后，`collect_prices` 连续 55 轮的假红消失了。
- 整轮耗时 13:35 → 15:12，约 1h37m（原 2h55m），省掉的正是每标的一个 daily 请求。

**仍未处理**：cron 仍是 `35 13,18`，两班都在 gate 之前，所以 D 的收盘价仍要等到 D+1 的
13:35 PT 那班才入库——盘中仍落后一个 session。这一条要等 cron 改动。

---

## 二、吞吐：76% 的周期花在与 batch 大小无关的固定成本上

### 测量

连续 8 个周期（2026-09-17 10:24–11:28 UTC），按日志里 job / OI-delta / scanner
物化三类事件切分：

```
cycle_end  total_s  job_s  deriv_s  jobs  deriv_symbols
 10:24:37      453     78      373    10            323
 10:33:29      498    129      367    10            323
 10:42:12      491    125      364    10            323
 10:51:30      481    116      363    10            323
 11:02:39      518    140      376    10            323
 11:10:37      443     70      371    10            323
 11:19:29      502    132      368    10            323
 11:27:55      475    108      365    10            323
```

10 个 job / 483 秒 = **74.5 job/小时**，与队列侧独立测得的 ~70/小时一致。

拆开来：

| 阶段 | 秒 | 占比 | 是否随 batch 增长 |
|---|---|---|---|
| 10 个链刷新（并发 3） | 112 | 23% | 是 |
| 全 universe 派生（323 标的） | **368** | **76%** | **否** |

按 batch 边界统计的空转：忙 6191s vs 空 18789s，**通道 75% 的时间没有任何 job 在飞**。
worker 每 60s 轮询一次，轮询到的是空队列——瓶颈不在 worker 容量，在每个 batch
之后那一次固定成本的全量派生。

### 一个被误读的中间结果（记录在此）

先按 `started_at` 重叠度算并发，得到 max=10，与 `REFRESH_WORKER_CONCURRENCY=3` 矛盾。
原因是 `run_refresh_worker.fetch_jobs` 在 **claim 时**给整批 10 个统一打
`started_at = NOW()`，所以 10 个 job 看起来同时开始。该测量无效，
真实执行并发仍是 3。下一次量并发要用别的信号，不能用 `started_at`。

### 改法（参数，待确认）

派生成本不随 batch 增长，所以把同一次派生摊到更多 job 上是唯一不增加 provider
压力的提速手段：

```
REFRESH_WORKER_BATCH_SIZE          10 → 30
OPTION_REFRESH_QUEUE_TARGET        20 → 60
OPTION_REFRESH_MAX_ENQUEUE_PER_CYCLE 20 → 60
```

预期：周期 = 3×112 + 368 ≈ 704s，30 job/704s = **153 job/小时**（现 69），2.2 倍。
316 标的扫完一轮 2.1 小时，落回 `OPTION_REFRESH_MAX_AGE_SCAN=150` 分钟的既定节奏
之内，也落回 `freshness.js` 的 180 分钟目标之内——**不需要动任何阈值**。

不变的部分：provider 请求速率（pacing 不变）、执行并发（仍 3）、
派生的单进程假设（频次反而从 ~7.5 次/小时降到 ~4.5 次/小时）。

部署必须 `pm2 delete` + `pm2 start ecosystem.config.cjs --only <name>` + `pm2 save`；
`pm2 restart` 不读配置文件。

---

## 三、退役 8 个不存在的 ticker

三条独立证据，沿用 `09c70c2` 的标准（两个端点都验，不靠单次 job 报错推断）：

| 标的 | 09-16 是否成交 | `/v3/reference/tickers/{sym}` | 库内 price bar | 库内合约 |
|---|---|---|---|---|
| ACAC / FX / OS / RE / SMS / SPC / TPS / TTM | 否 | **404** | 0 | 0 |

其中 ACAC、FX、OS、RE、SMS、TTM 正是让 `collect_prices` **每轮**非零退出的那 6 个
（55 次运行 55 次抛 `RuntimeError`），所以 PM2 每班都标红，真故障和常态分不开。

对照组——保留，它们不是"没有信息"：

| 标的 | 09-16 是否成交 | reference | price bar |
|---|---|---|---|
| BATL / CBUS / LINK / MINE / SGP | 是 | active=True, type=CS | 152–442 |
| NOEM | 否（当日无成交） | active=True, type=CS | 284 |

这 6 个是真实在交易的股票，只是**没有挂牌期权**，所以 GEX 报
`insufficient_data` 是正确结论。它们仍然每轮吃一次产出为 0 的链抓取——
这笔浪费单独记录，未在本次改动范围内处理。

OMAH（36 合约）和 UP（6 合约）**确有期权、只是太薄**，卡在 GEX 质量门槛上，
属正确行为，不动。

### 退役必须是持久的

`sync_universe.py` 的 upsert 原本在 `ON CONFLICT` 里无条件 `active = TRUE`。
代码库里**没有任何地方自动把 `active` 置 FALSE**——它只会被人为退役置 FALSE——
而种子集合取自 `iv_history ∪ price_history ∪ option_chain_snapshots`，
恰恰保留着这些"因为产不出东西而被退役"的 ticker 的行。
于是每跑一次 sync 就把每一次退役撤销一次，且不留任何原因记录。

已改为 `ON CONFLICT` 只更新 `updated_at`。新标的照样 active——`active` 列默认 TRUE，
只靠 INSERT 就够。

这正是 `09c70c2` 提交信息里记下的那个坑（"sync_universe.py had adopted it from a
history table and only ever adds/activates"），当时按单个标的绕过，这次修在根上。

---

## 复现

```bash
cd collector

# 一、provider 的拒绝理由（换任意当日日期）
venv311/bin/python - <<'PY'
import sys; sys.path.insert(0,'.')
from dotenv import load_dotenv; load_dotenv('.env')
from providers.polygon_http import PolygonHttpClient
http = PolygonHttpClient(required_for='probe', pacing_scope='breadth')
for d in ('2026-09-17','2026-09-16'):
    try:
        p = http.get_json(f'{http.base_url}/v2/aggs/grouped/locale/us/market/stocks/{d}',
                          params={'adjusted':'true','include_otc':'false'}, context=d)
        print(d, 'OK', len(p.get('results') or []))
    except Exception as e:
        print(d, e)
PY

# 二、字母表切点
#   SELECT left(symbol,1), count(*) FROM (
#     SELECT DISTINCT symbol FROM price_history WHERE date='2026-09-16') s
#   GROUP BY 1 ORDER BY 1;

# 三、周期拆分：从 collector 日志按 job / "OI delta rows" / "Materialized scanner
#     candidates" 三类事件切段，量每段的 total / job / deriv 三个时长

# 四、单测
venv311/bin/python -m unittest discover -s tests      # 565 passed
```
