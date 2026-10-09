# 数据源评估：DXLink 推送 vs 当前的双源轮询 — 2026-10-09

起因：问「数据拉取怎么才能更及时」。先穷尽了不花钱的工程手段，确认 $29 档已经到头，
再去找能**推送**而不用轮询的数据源。

---

## 一、不花钱的办法已经穷尽

| 办法 | 结论 | 依据 |
|---|---|---|
| 提高 worker 并发 | **空操作** | 3→6 吞吐不变（155 job/小时），通道 77% 空闲 |
| 收紧调度节奏 | **已做** `SCAN 150→75` | 需求 ~258/h 对容量 ~304/h，再降需先减请求 |
| 按访问热度分层 | **机制已存在，层里是空的** | `recent_active` 近 24h 实测 **0 个**；7 天内被 Analyze 打开过的只有 **2 个**（未上线） |
| 砍 DTE bucket（7→5） | **否决** | >90 DTE 贡献 **12.59%** 的总 \|gamma×OI\|，314 个标的里 **180 个**占比超 10%，最坏 100% |
| Polygon websocket | **不解决链的时效** | 见下 |
| 盘中刷 30 分钟线 | **做不成** | 套餐把分钟聚合拦到收盘后 |

两条值得单独记：

**`OPTION_MAX_DTE=150` 不能降。** 它同时被期限结构（`exp_max`）、OI/Max-Pain 窗口、
以及 `adaptive_oi_window_pct` 的 √t 缩放使用。只砍 `OPTION_DTE_BUCKETS` 才只影响主链。
但主链少了 91–150 天的合约会让 GEX 静默偏移约 13% —— GEX 是核心产出，不划算。

**盘中 30 分钟线在动手前被否掉。** 15:03 ET 请求 SPY 的 30 分钟线，返回 64 根、
**今天 0 根**。分钟聚合和日线一样被拦到收盘后，盘中刷多少次都是昨天的数据。
一次请求省掉了一整个结构上不可能产生新数据的采集器。

---

## 二、Polygon/Massive websocket：有，但推的不是我们要的

定价页写着 Starter 就含 WebSockets，我据此一度说「不花钱就能解决」。**那个结论错了。**
用自己的 key 直连，让服务器回答权限：

```
wss://delayed.polygon.io/options        认证通过
  AM.*  (分钟聚合)  ✓ subscribed
  A.*   (秒聚合)    ✓ subscribed
  T.*   (逐笔)      ✗ not authorized
  Q.*   (报价)      ✗ not authorized
  FMV.*             ✗ not authorized

wss://socket.polygon.io/options         全部拒绝
  "You don't have access real-time data"
```

能推的只有聚合（OHLC + 成交量）。**greeks / IV / OI / bid-ask 一个都不推**，
那些只在 REST snapshot 里。而 75 分钟的链龄恰恰是 REST 快照的节奏问题，
**websocket 解决不了**。它能带来的是「每张合约的分钟级成交」——一类我们现在没有的数据，
对资金流/异动功能有价值，但那是新功能，不是时效性修复。

---

## 三、Tastytrade DXLink：一条推送 = 现在两个源

实测（收盘后，922 个合约 = SPY/AAPL/TSLA/NVDA/QQQ 五条链）：

```
790/922（86%）拿到全套三类事件，零错误

.SPY261113P719
  Greeks   volatility 0.1883  delta -0.0989  gamma 0.00381  theta -0.1108  vega 0.4227
  Summary  openInterest 18
  Quote    bid 2.19  ask 2.21  bidSize 55  askSize 218
```

标的本身同样可订阅（`Quote`/`Trade`/`Summary`/`Profile`，27 个事件实测通过），
所以**一个源覆盖现在 Polygon 期权链 + IB 报价 + 标的价格三条路**。

**最该记住的一点**：IB 报价通道所有的病——并发 1、client id 冲突、中位 257 分钟、
70 分钟断连——都源于它在补 Polygon 这档缺的那一块。换源之后这些问题不是被修好，
**是不再存在**。

### 已修：64KB 帧上限

`collect_dxlink_events` 一次性发全部订阅。922 合约 × 3 类 = 2,766 条，直接撞上限：

```
零数据 + channel 0 一条 ERROR
  INVALID_MESSAGE: Max frame length of 65536 has been exceeded
```

**这和「账户没有期权权限」表现完全一致**，差别只在那条 ERROR，而它在 channel 0、
不在数据通道上。已按 `DXLINK_SUBSCRIPTION_CHUNK`(120) 分片，5 个单测覆盖
分片/完整性/帧大小/空输入。该函数此前只在调试脚本里订过几个合约，所以上限从没被碰到。

### 账户状态：卡在入金，不是开户

```
TT_BASE_URL 未设置 → api.tastyworks.com（生产，非沙盒）
/customers/me/accounts   200，两个 Individual 保证金账户，2026-06-20 开通
/market-data/by-type     403 Forbidden        ← 文档：仅限已入金账户
/api-quote-tokens        level: demo, url 含 /delayed   ← 文档：实时档 level 应为 api
```

复验判据（入金后一分钟可做）：重调 `/api-quote-tokens`，看 `level` 是否变 `api`、
URL 的 `/delayed` 是否消失。

### 仍未知

**盘中真实消息速率。** 收盘后只有初始快照、无持续更新。全 universe
322 标的 × 约 120 合约 ≈ **3.8 万个合约**，能否单连接全量订阅取决于盘中速率，
这决定常驻采集是覆盖全量还是热子集。**先测再建**——否则就是重犯 30 分钟线那个错误。

---

## 四、全网数据源调研：便宜的订阅解决不了商业化

| 数据源 | 推送 | greeks/IV/OI | 报价 | 零售价 | 授权 |
|---|---|---|---|---|---|
| **Tastytrade DXLink** | ✓ | ✓ 实测 | ✓ | **$0**（实时需入金） | 券商客户 |
| Massive（在用） | ✓ 仅聚合 | REST | $199 档 | $29 / $79 / $199 | **全档 Individual use** |
| ThetaData | ✓ | ✓ | ✓ | $40 / $80 / $160 | **personal, non-commercial** |
| Intrinio | ✓ | ✓ | ✓ | 询价 | — |
| CBOE LiveVol / OPRA | ✓ | 自算 | ✓ | $380+ 加 OPRA 费 | — |
| Unusual Whales / Bullflow | ✓ | 偏资金流 | — | — | **禁止再分发** |

三家零售档一致禁止商业使用，不是巧合。根源是 **OPRA**——所有美国期权行情的唯一汇总方，
按是否再分发收费：

```
OPRA Redistributor License   $1,500/月（符合条件 $650）
ThetaData 商业档 期权         $1,600/月
ThetaData 商业档 股票         $1,200/月
且：收到再分发数据的每个非专业用户各自计费
```

**把期权数据展示给付费订阅者，在定义上就是再分发。** 所以商业化的底价是
OPRA 费 + 厂商商业授权，不存在 $200 以下的版本。

**而当前 $29 的 Massive 档位已经是 "Individual use"** —— 这个约束今天就存在，
不是升级或换用 `tt_internal` 造成的。

---

## 复现

```bash
cd collector

# Polygon websocket 权限（用自己的 key 让服务器回答）
#   连 wss://delayed.polygon.io/options 与 wss://socket.polygon.io/options
#   auth 后逐个 subscribe AM.* A.* T.* Q.* FMV.*，看 success / not authorized

# DXLink 全链路
venv311/bin/python - <<'PY'
import sys; sys.path.insert(0,'.')
from dotenv import load_dotenv; load_dotenv('.env')
from providers.tastytrade_option_chain_provider import TastytradeOptionChainProvider
from providers import tastytrade_dxlink as dx
from collections import Counter
p=TastytradeOptionChainProvider(); tok=p.fetch_quote_token()
print('level:', tok.level, '| url:', tok.dxlink_url)
syms=[]
for u in ['SPY','AAPL','TSLA','NVDA','QQQ']:
    ch=p.fetch_option_chain(u)
    syms += [(c.raw or {}).get('streamer_symbol') for c in ch.contracts if (c.raw or {}).get('streamer_symbol')]
res=dx.collect_dxlink_events(tok, syms, ['Quote','Greeks','Summary'], timeout_seconds=30)
by=res.get('events_by_symbol') or {}
print(f'覆盖 {len(by)}/{len(syms)}', dict(Counter(e.get("eventType") for e in res["events"])))
PY

# 入金后复验实时档
#   GET /api-quote-tokens -> level 应为 'api'，url 不含 /delayed

venv311/bin/python -m unittest discover -s tests      # 627 passed
```
