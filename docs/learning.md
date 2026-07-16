# Learning Notes

## Options Fundamentals

### Why strategies fail in practice (even with correct theory)
1. **IV expansion on entry** — buying options in high IV means you need a bigger move to profit
2. **Theta drag** — long options lose value daily even if spot doesn't move
3. **Wide bid/ask** — illiquid strikes can cost 0.10-0.30 in slippage each way
4. **Early assignment risk** — short ITM options near ex-dividend can be assigned early
5. **Correlation of legs** — in fast markets, spread legs may not fill at expected prices

### IV Rank vs IV Percentile
- **IV Rank**: where current IV sits between 52-week high and low (0-100 scale)
- **IV Percentile**: % of past days where IV was lower than today
- IV Rank is more commonly cited but IV Percentile is more statistically meaningful
- High IV Rank (>50) favors selling premium; Low IV Rank (<30) favors buying

### Greeks intuition
- **Delta**: how many shares of stock this position behaves like
- **Gamma**: how fast delta changes (high near expiry, near ATM)
- **Theta**: daily P&L from time passing alone (negative for buyers, positive for sellers)
- **Vega**: P&L per 1% increase in IV (positive for long options)
- **Rho**: P&L per 1% increase in interest rates (usually small, matters more for LEAPS)

### Key strategy selection heuristics
| Market view | IV view | Consider |
|---|---|---|
| Bullish | Low IV | Long Call, Bull Call Spread |
| Bullish | High IV | Bull Put Spread, Short Put |
| Bearish | Low IV | Long Put, Bear Put Spread |
| Bearish | High IV | Bear Call Spread, Short Call |
| Neutral | High IV | Iron Condor, Short Strangle, Iron Butterfly |
| Neutral | Low IV | Long Straddle, Long Strangle |
| Volatile (dir unknown) | Low IV | Long Straddle, Long Strangle |
| Volatile (dir unknown) | High IV | Backspread |

## Black-Scholes Assumptions & Limitations
- Assumes log-normal distribution of returns (ignores fat tails)
- Assumes constant volatility (in reality, IV surface exists)
- Assumes no dividends (or adjust with continuous dividend yield)
- European options only (American options can be exercised early)
- For American options: use binomial tree or Bjerksund-Stensland model

## Calendar Spread Special Considerations
- When near-term leg expires, the position becomes a simple long option
- Profit zone at near-term expiry: stock near the short strike
- Risk: large move in either direction before near-term expiry
- Vega positive initially, can become Vega negative after near-term expiry
- IV term structure matters: buy cheap back-month vol, sell expensive front-month vol

## Common Adjustment Rules (General)
- **Roll up/down**: adjust strikes when position goes against you
- **Roll out**: extend DTE by buying back near-term and selling further out
- **Add a wing**: convert naked short to spread to limit risk
- **Take profit early**: at 50% of max profit for defined-risk trades (tasty-style)
- **Stop loss**: at 2× credit received for credit spreads

## 期权实战交易框架（V2 扫描器设计依据）

### 核心认知：正股是1维，期权是3维

正股只需判断**方向**。期权需要同时判断：
- 方向（涨/跌/横盘）
- 幅度（涨多少）
- 时间（什么时候到）
- IV 水平（买入时贵不贵）

方向对了但幅度不够、时间不对、买入 IV 太高——照样亏钱。

### 两种交易哲学

**卖方（Premium Seller）— 高胜率路线**

逻辑：IV 长期系统性高于 RV，差值叫**波动率风险溢价（Vol Risk Premium）**。

```
历史数据示例（SPY）：
  30日 IV 均值 ≈ 16%
  30日 RV 均值 ≈ 13%
  差值 ≈ 3% → 卖方的统计优势来源
```

- 胜率 70-90%，但单次亏损可能很大
- 代表策略：Iron Condor, Credit Spread, Strangle, Covered Call

**买方（Premium Buyer）— 低胜率但非对称**

- 需要：方向对 + 幅度够 + 时间内到 + IV 不能太高
- 适合：有明确 catalyst（财报/FOMC）且 IV 处于历史低位时

### Tastytrade 系统化框架（有回测支撑）

```
过滤条件：
  IVR > 50（IV 相对历史高位，均值回归预期）
  流动性好（bid-ask tight，OI > 1000）

开仓：
  DTE = 45 天（Theta 衰减加速区间）
  短腿 Delta = 0.16 ~ 0.30（胜率 70-84%）
  用 defined-risk 结构控制最大亏损（Spread / Condor）

管理规则：
  盈利 50% → 平仓（不等到期，避免 gamma 风险）
  亏损 200% 权利金 → 止损
  DTE < 21 → 考虑 roll 或平仓

仓位规模：
  单标的 ≤ 5% 资金
  同时持有 15-20 个不相关标的（分散 vega 风险）
  整体 Delta 保持中性或小方向偏移
```

**为什么 50% 平仓？**
数学上，一个 trade 赚 50% 的概率远高于等到期的期望，且最后几天 gamma 急剧上升，风险报酬比变差。

### 真正的 Edge 来源

| Edge | 原理 |
|---|---|
| Vol Risk Premium | IV 系统性 > RV，卖方长期有统计优势 |
| IV 均值回归 | 高 IV 会回落（VIX spike 后必然收缩）|
| Theta 确定性 | 时间衰减是确定的，方向是随机的 |
| 结构优化 | 相同方向判断，用对结构可提高盈亏比 |

### 常见死法

| 死法 | 原因 | 解法 |
|---|---|---|
| IV crush 买方 | 财报前买期权，事后 IV 暴跌 | 看 IVR，高 IV 不买；用 spread 对冲 vega |
| 裸卖被黑天鹅 | 卖 naked，遇单边暴动 | 永远用 defined-risk（spread）|
| 仓位集中 | 多个相关标的同方向 | 分散，控制 portfolio-level Greeks |
| 不止损 | 亏 300% 还在等反弹 | 机械止损，2x 权利金必须平 |
| Gamma 爆炸 | DTE < 7 还持仓 | 21天内 roll 或平仓 |

### V2 扫描器设计依据

扫描器核心就是自动化上面这套框架：

```
扫描过滤：
  IVR > 50
  DTE 30-60
  流动性（OI + volume 阈值）
  标的行业分散（避免相关性集中）

输出内容：
  推荐策略类型（Condor / Strangle / Credit Spread）
  建议 Delta 范围
  预期最大利润 / 最大亏损
  当前 POP（Probability of Profit）
  IV Rank 当前值
```

**结论：IV Rank 是整个扫描系统最关键的数据。**
没有 IV Rank 就没有卖方选股标准，等于在任意 IV 水平随机卖，长期期望值很差。
这也是为什么 V2 第一个要建的表是 `iv_history`。

## IB API Notes (for V2)
- IB Gateway needs to be running for API access
- Client Portal API: REST, requires manual login every 24h (not ideal for production)
- IBKR Web API (OAuth): better for production, requires application approval
- TWS API: socket-based, Python library `ib_insync` is the best wrapper
- Paper trading available on separate port (7497 vs 7496 for live)

## Current Scanner / Analyze Logic (Phase 3D-3)

当前系统已经有三层真实数据，但前端消费程度不同：

1. IV / volatility metrics：`iv_history` → `/api/metrics`
2. 价格历史：`price_history` → `/api/prices/:symbol`
3. Options positioning：`option_chain_snapshots` + `gex_snapshots` → `/api/options`, `/api/chain`, `/api/gex`

重要边界：
- scanner 仍是 IV-first watchlist triage，没有使用 GEX 过滤。
- analyze 已读取 `/api/gex/:symbol`。只要 required fields 完整，fresh/stale/partial 都显示真实 GEX/Walls/PCR/Max Pain；stale/partial 额外显示 age/confidence 提示。
- `tt_internal` 与 `ib_internal` 是当前过渡数据链，API 不同步调用 provider。

### Scanner 当前算法

后端入口：`GET /api/scan`

真实输入：
- `iv_history` latest row per watchlist symbol：
  - `iv30`
  - `hv30`
  - `iv_rank`
  - `iv_percentile`
  - `iv_hv_diff`
  - `earnings_date`
  - `source`
- `price_history` latest row：
  - `price_close`
  - `price_date`
  - `price_source`
  - `price_status`

过滤逻辑：
- `minIvr <= iv_rank <= maxIvr`
- `iv_hv_diff >= minIvHv`
- universe 限定为 `collector/watchlist.txt`
- `limit` 上限最大 200

排序：
- `iv_rank DESC`

前端策略标签：

| 条件 | 当前标签 | 说明 |
|---|---|---|
| `IV Rank >= 50` | `Iron Condor` | 高 IV，教育性地偏向定义风险卖方结构 |
| `30 <= IV Rank < 50` | `Iron Condor` | 中等 IV，小仓位/观察语义 |
| `IV Rank < 30` | `Long Straddle` | 低 IV，观察买方波动结构 |

这些标签不是完整交易推荐。当前 scanner 尚未使用：
- option bid/ask spread liquidity
- DTE / strike selection
- delta target
- GEX regime
- Call Wall / Put Wall proximity
- gamma flip distance
- unusual OI / volume
- real POP
- technical trend engine

### Analyze 当前算法

前端入口：`/analyze?symbol=...`

真实输入：
- `/api/metrics`：覆盖 IV Rank、IV Percentile、IV30、HV30、HV60、IV-HV diff、earnings date。
- `/api/prices/:symbol?limit=60`：覆盖 latest price、60日 OHLCV、RVol。

价格趋势派生：
- latest close 来自 60日 OHLCV 最后一根。
- RVol = latest volume / prior 20 trading bars average volume。
- 若 close >= 20日均线：`价格强于20日均线`；否则 `价格弱于20日均线`。
- 5日涨跌幅 > 1%：`向上增强`。
- 5日涨跌幅 < -1%：`向下减弱`。
- 其他：`横盘整理`。

缺失数据逻辑：
- 有价格但无 metrics：进入 price-only fallback，只展示真实价格趋势，不生成期权策略结论。
- 无价格也无 metrics：根据 `/api/status` 判断 symbol 是否在 watchlist。
- API 全部失败但本地有 mock symbol：只作为本地示例结构，并显示 API 不可用提示。

当前已接入 analyze UI 的真实数据：
- `/api/gex/:symbol`
- strike-level GEX
- Call Wall / Put Wall
- Gamma Flip metadata
- PCR OI / PCR Volume
- Max Pain

GEX 使用条件：
- 有 `global_gex`, `call_wall`, `put_wall`, `strikes` 等 required fields。
- freshness 和 confidence 是质量标签，不再作为整块隐藏 GEX/Wall 的条件。
- missing required fields 时 fail closed，不能从 mock shell 保留 wall 或策略腿。

GEX fallback：
- GEX missing/unusable：保留 IV + price 页面，不把 mock wall/gex 标记成真实。
- GEX stale/partial 但字段完整：继续显示实际数据，并明确标注 snapshot age 与质量。
- 有 GEX + price 但无 `/api/metrics`：展示真实 GEX / Walls / PCR / Max Pain；IV Rank 显示不可用；不生成策略腿推荐。

当前仍未接入 analyze UI 的真实数据：
- real option-chain-derived POP
- real strategy legs
- unusual activity

### Options Positioning 数据层现状

TT 过渡数据源已经能写入：
- underlying Quote / Trade
- option Quote
- option Trade
- option Summary / open interest
- option Greeks
- option TheoPrice
- option Profile raw payload

GEX compute job：
- `GEX_SYMBOLS=PLTR venv311/bin/python compute_gex.py`
- 只读 PostgreSQL snapshot，不调用 provider。
- 写入 `gex_snapshots` 和 `gex_by_strike_snapshots`。

V1 公式：
- Call GEX = `gamma * open_interest * 100 * spot^2`
- Put GEX = `-gamma * open_interest * 100 * spot^2`
- Global GEX = strike-level net GEX 汇总
- Local Gamma = spot ±1% 内 strike net GEX 汇总
- Call Wall = max call-side GEX strike
- Put Wall = max absolute put-side GEX strike
- Gamma Flip = spot ±10% grid 上重新估算 gamma；没有 0-crossing 时取 abs(net GEX) 最小点
- PCR OI = total put OI / total call OI
- PCR Volume = total put volume / total call volume

当前原则：
- 不把 mock shell 伪装成真实 options data。
- 不把 `tt_internal` / `ib_internal` 当作公开/付费产品的授权 option-chain data。
- GEX 只有在 gamma + OI completeness 达标后才计算。
- scanner 已可读取 latest GEX snapshot 做 Gamma regime / Wall proximity / Local Gamma / OI / Volume / Volume-to-OI filters。
- Scanner 的 IV/trend/GEX 用于 context、过滤和解释；`不限`必须跨所有已支持策略枚举达标 contract setups，不能先把一个 symbol 压成单一策略。
- OI delta 异常需要连续 snapshot 历史；当前 Volume-to-OI 只能作为活跃度 proxy。
- licensed provider 第一候选是 Massive/Polygon options snapshot，第二候选是 Intrinio；真正上线前必须确认 OPRA/options display 与 redistribution 权利。
- Phase 3C 后，`/api/scan` 不再做 request-time full watchlist aggregation；scanner rows 由 `collector/materialize_scan.py` 预计算进 `scanner_results_snapshots`。
- stale/missing API responses 只 enqueue `provider_fetch_jobs`，不在用户请求路径同步调用 provider。
- `collector/run_refresh_worker.py` 是 refresh job 执行边界；`provider_request_usage` 记录每日 provider budget；`/api/status/cache` 用于观察 backlog、failure、stale scanner、empty snapshot。
- Phase 3E 已实现 OI delta / unusual activity：用连续 option contract snapshots 计算 OI delta；volume/OI 只是 proxy，不能等同“机构建仓确认”。
- `/api/unusual/:symbol` 的 `quiet` 表示有 confirmed OI delta 数据但未命中 unusual 阈值；`baseline` 表示还没有 previous snapshot，不能确认 OI delta。
- Scanner direction 已接入真实 `price_history` 派生趋势：MA20/50/200、RSI14、5D change 写入 `scanner_results_snapshots`，前端不再硬编码 `待接入趋势`。
- Scanner earnings risk 来自 `iv_history.earnings_date`；0-14 天内标记 warning。该字段仍依赖 TT/后续 licensed provider 的财报日质量。
- Scanner row click 必须直接带 `tab=0`，Analyze 自动加载时如 URL 已一致应 skip 或 `replace`，避免浏览器后退出现 `/analyze?symbol=XXX` 的中间历史记录。
- Scanner UI should not expose unexplained raw terms as the default workflow. Keep English market terms for precision, but put OI/Volume/Local Gamma/Unusual Count/OI Delta/Put-Call Ratio behind advanced filters with Chinese explanations and default opportunity presets.
- The 67-symbol watchlist is only the current data-ingestion pool. Future scanner universe should be market-wide or at least much broader, filtered by market cap, price, dollar volume, optionable/liquidity constraints, sector and event windows.
- DTE means Days To Expiration. Bid/ask spread should be computed from quote fields, usually `(ask - bid) / mid`; do not ask users to infer this manually.
- IB and TT transitional snapshots can carry bid/ask and Greeks; product UX should distinguish whether the current cached snapshot actually exists for a symbol.
- Contract-level scanner filters are optional advanced controls; if blank, backend does not filter. If supplied, `/api/scan` requires at least one latest option contract matching DTE/Delta/spread/liquidity constraints.
- Strategy parameter presets should be the default UX for contract-level filters: users choose 保守 / 标准 / 进取 / 短线 / 流动性优先, and the UI maps that choice to DTE, Abs Delta, max bid/ask spread, contract OI and contract volume.
- Default scanner profile is `不限`：不施加隐藏 preset，在当前采集窗口 1-90 DTE 内枚举全部达标候选；策略 chips 和保守/标准/进取/短线/流动性优先用于收窄结果。
- Scanner columns need in-context product meaning: IV Rank is historical IV rank, POP is a rules estimate, `ΔOI` is OI delta, and empty Wall means no GEX/Wall snapshot. Do not expose generic internal data-status columns; show actionable states such as `待采集` inside the relevant column. Headers should be sortable.
- Wall is not a standalone provider field in the UI; it is derived from cached option contracts through GEX computation. If a symbol has no latest option contract snapshot, it cannot have Call Wall / Put Wall in scanner.
- Regression coverage must include cross-boundary provider contracts: API enqueue defaults must be executable by the worker, and placeholder providers must fail tests instead of silently producing stuck jobs.
- Scanner strategy labels currently include sell put spread / sell call spread through `Bull Put Spread` / `Bear Call Spread`. Naked `Short Put` / `Short Call` and butterfly variants are in the strategy library but still need recommendation-engine integration.
- Scanner recommendations must be concrete setups, not just strategy names. A useful row should show selected legs, DTE, credit/debit, risk and breakeven when the cached option snapshot supports it; otherwise it must say why setup construction is unavailable.
- Option-chain collection must sample multiple DTE buckets. A global contract cap without a per-expiration cap can silently persist only the nearest selected expiration, which makes scanner recommendations look concrete but strategically incomplete.
- Analyze pages must not seed real symbols with mock GEX/Wall values. If real GEX is stale, missing or unusable, clear Wall/recommendation fields and show a partial-data panel instead of carrying mock Call Wall / Put Wall forward.
- Analyze 技术评分已使用真实 price history 的 MA20/50/200、RSI14、MACD 和 5日变化；MA200 数据不足时保持 null，不伪造。
- 策略矩阵已用 IV Rank + trend score + GEX context 生成策略/DTE/delta/width；当前 legs 是 target fallback，不是完整 live-chain optimal leg selection。

## 开发复盘：已确认的 Bug 与踩坑

这一节记录开发过程中已经被代码、日志、数据库或生产 API 证实的问题。它们不是抽象的架构偏好，而是后续修改必须回归测试的具体经验。

### 1. 不允许用 expiry/strike/right 笛卡尔积生成合约

- 旧错误：把 `reqSecDefOptParams` 返回的全局 expiration 集合和 strike 集合互相组合，再拼出 call/put。
- 根因：IB 返回的 expiration 集合和 strike 集合是独立可用集合，不代表每个组合都存在。
- 后果：可以生成现实中不存在的 contract symbol，进而得到错误的 DTE、Wall、GEX 和策略腿。PLTR 曾出现远离现价的虚假 Call Wall/Put Wall，就是这一类数据污染的表现。
- 修复：先按 DTE bucket 选 expiry，再对每个 `expiry + right` 调用无 strike 的 `reqContractDetails`；只接受 IB 实际返回且 `conId > 0`、expiry/right 精确匹配的 contract。
- 不变量：同一 snapshot 按 `conId` 去重；没有 valid `conId/localSymbol` 就不能请求行情或写入 contract snapshot。
- 测试：`test_option_provider_selection.py` 验证不会选择 IB 未返回的 strike/right 组合。

### 2. snapshot 的“有记录”不等于“字段可用于 GEX”

- 旧错误：只看到 option contract rows 就认为 quote、Greeks、OI 都可用。
- 根因：IB 可以返回 contract definition，但 market data 权限、延迟行情类型、generic ticks 或当前合约流动性可能导致 bid/ask、Greeks 或 OI 缺失。
- 修复：snapshot 记录 `completeness_pct`、`missing_greeks_ratio`、`missing_oi_ratio` 和 provider status；GEX 对缺少 gamma/OI 的 contract fail closed，不用估算值补齐。
- UI 规则：required fields 完整但 snapshot stale/partial 时继续显示真实 GEX/Wall，并标记 age/confidence；required fields 缺失才显示 unavailable。
- 经验：STX/TSLA 曾有 54 个 IB contract rows，但 completeness 为 0%，因此没有 GEX/Wall。这是正确的保护行为，不是把 metadata 当成行情。

### 3. mock 数据泄漏会制造看似完整的错误分析

- 旧错误：Analyze 先初始化 `mockAnalysis`，真实 GEX stale 或请求失败后仍保留 mock Call Wall、Put Wall、scenarios 和 recommendation。
- 后果：PLTR 页面曾显示与现价完全不相称的 `$595 / $575`，用户无法判断数据是否真实。
- 修复：typed symbol 不允许 API 失败时回退到本地 mock；missing/unusable GEX 清空 Wall、strikes、scenarios 和策略腿；stale/partial 且字段完整则显示实际数据并加质量提示。
- 测试：frontend regression tests 覆盖 fresh、stale、missing、low-confidence 四种状态。

### 4. collector 默认 universe 错误会造成“只有 PLTR 有数据”

- 旧错误：`collect_options.py` 默认只采集 `AAPL,SPY,QQQ,PLTR`，而 scanner 实际 watchlist 是 67 个标的。
- 后果：price/IV 覆盖率看起来正常，但 option snapshot/GEX 覆盖严重不足；其他标的 Analyze 显示不可用。
- 修复：option collector 默认读取 `collector/watchlist.txt`；`OPTION_SYMBOLS`/`SYMBOLS` 只用于 bounded backfill。PM2 scheduler 每批最多补 2 个 missing/old symbols，missing 优先、最旧优先，失败后冷却 30 分钟。
- 验证：NBIS 真实 IB snapshot 完成后，生产 option coverage 从 8/67 增至 9/67，随后继续处理 AIQ。

### 5. provider job 的默认值必须是 worker 真正支持的 provider

- 旧错误：API enqueue 使用占位 provider 名称，job 能写入 PostgreSQL，却永远不能被 worker 消费。
- 修复：server 和 collector 的支持集合都包含 `polygon_licensed`；API enqueue 默认也是 `polygon_licensed`。跨边界测试禁止默认值再次漂回 TT 或占位 provider。
- 额外保护：malformed ticker（包括中文输入法组合产生的 `SS'TS'T'XSTX`）在入队前拒绝；`__SCAN__` 只允许 scanner materialize。

### 6. Tastytrade 认证不能在每次请求时重新申请 session

- 旧错误：把 401/网络错误都当成可重试登录，并让多个 worker/每个 symbol 重复申请 TT session。
- 后果：产生登录风暴，触发 provider circuit lock 或 device challenge，反而扩大故障。
- 已确认现象：remember-token 续期返回 `403 device_challenge_required`，这不是普通请求可以无限重试的 401。
- 修复：worker 在一次运行内缓存 provider/session；认证不可用时阻断 TT 重复尝试，option job 立即 fallback 到 IB；失败 job 写回 `provider_fetch_jobs`，不假装成功。
- 运行策略：TT 作为自动 refresh 首选；IB delayed data 作为当前 fallback。失败 symbol 有冷却时间，不会持续 rotate token。

### 7. cron/LaunchAgent runtime copy 造成“改了代码但运行的不是这份”

- 旧错误：把 repo 复制到 `~/.quantrift_options_collector`，再通过 LaunchAgent/cron 运行副本；后续改动需要同步，容易出现线上/本地代码不一致。
- 另一个问题：本机 `crontab` 写入曾在系统权限环境中挂起，不能把“写入成功”当作调度已生效。
- 修复：PM2 直接执行当前 repo 的 `collector/venv311`；`ecosystem.config.cjs` 是唯一运行配置，不再同步 runtime 副本。
- 验证：`quantrift-options-collector` 常驻，价格任务完成 67 symbols/4020 rows/0 failed，`pm2 save` 已完成。

### 8. 只做 py_compile 不足以证明 collector 可用

- 语法通过只说明 Python 能解析文件，不能证明 IB contract identity、行情字段、数据库落库、GEX 计算和 API 输出正确。
- 当前最低验证闭环：collector unit tests、server tests、frontend tests/build、真实 IB snapshot、PostgreSQL row identity/completeness、GEX/OI delta/scanner materialization、生产 API 查询。
- 本次记录：collector 37 tests、server 4 tests、frontend 6 tests 全部通过；NBIS 真实 snapshot 30 个 distinct valid `conId`，Greeks missing 0%，OI missing 3.33%，并成功生成 GEX 与 scanner rows。

### 10. PM2 ecosystem.config.cjs 的 env 注入会阻断 load_dotenv

- **现象**：`.env` 里有 `POLYGON_API_KEY=xxx`，`load_dotenv` 也被调用，但 provider 仍报 `POLYGON_API_KEY is required`。
- **根因**：`ecosystem.config.cjs` 里写了 `POLYGON_API_KEY: process.env.POLYGON_API_KEY || ''`。PM2 daemon 启动时 shell 没有该变量，所以 PM2 把 `''`（空字符串）注入为进程环境变量。`load_dotenv` 默认不覆盖已有 env var，空字符串被当作"已设"，`.env` 里的真实值被跳过。
- **解法**：直接在 `ecosystem.config.cjs` 里写死 key 字符串，或去掉该行让 `load_dotenv` 从 `.env` 自然加载。
- **注意**：`pm2 restart --update-env` 只把当前 shell 环境变量合并进去，不重读 `.cjs` 配置文件。要重读配置文件必须用 `pm2 reload ecosystem.config.cjs --update-env`。

### 11. run_refresh_worker.py 有独立的 SUPPORTED_OPTION_PROVIDERS 白名单

- **现象**：`ecosystem.config.cjs` 和 `collect_options.py` 都加了 `polygon_licensed`，scheduler 日志显示 `provider=polygon_licensed`，但 jobs 立即报 `unsupported option provider for worker: polygon_licensed`。
- **根因**：`run_refresh_worker.py` 顶部有 `SUPPORTED_OPTION_PROVIDERS = {'ib_internal', 'tt_internal'}`，在 `run_option_chain_snapshot()` 入口处 guard check，不匹配直接抛 non-retryable RuntimeError。
- **解法**：在 `run_refresh_worker.py` 的 `SUPPORTED_OPTION_PROVIDERS` 和 `DEFAULT_OPTION_FALLBACK_PROVIDERS` 同步加入 `polygon_licensed`。
- **规则**：任何新 provider 必须同时在三处注册：`collect_options.py make_provider()`、`run_refresh_worker.py SUPPORTED_OPTION_PROVIDERS`、`server/src/routes/*.js` enqueue 默认 provider（如有）。

### 12. Polygon.io option chain API 关键字段细节

- **IV 格式**：`implied_volatility` 是 decimal，例如 0.337 = 33.7%，不是百分比整数。compute_gex.py 读取时不需要除以 100。
- **bid/ask**：来自 `last_quote.bid` / `last_quote.ask`，EOD 快照（收盘后采集）通常存在；盘中 delayed 模式下也可能有。mark = `last_quote.midpoint` 或 (bid+ask)/2。
- **underlying price**：每条 option result 的 `underlying_asset.price` 即当前 underlying spot，也可用 `GET /v2/aggs/ticker/{symbol}/prev` 拿 prev-day close，两者都可用。
- **分页**：response 含 `next_url`，直接用 session GET next_url（不带额外 params，URL 已编码完整），直到 next_url 为 None。
- **服务端过滤**：`strike_price.gte/lte` 和 `expiration_date.gte/lte` 在服务端过滤，减少数据量；`limit` 最大 250。
- **数据源标识**：source 字段写 `'polygon_licensed'`，区别于 `ib_internal` / `tt_internal`，用于商用分发授权追踪。

### 9. DTE 库存范围不是值得交易的订单

- 旧错误：Scanner 把 latest snapshot 的 `min_dte-max_dte`（例如 `2-65`）显示在“合约”栏，并从第一个可用 expiry 开始选腿。
- 根因：把数据覆盖诊断和策略候选混成一个产品概念；同时用固定 POP 64/66% 让一个策略标签看起来像完整推荐。
- 后果：用户看不到具体到期日、legs、可执行价格和风险收益，短到期合约还可能因为排序被默认选中。
- 修复：`不限`枚举当前采集窗口 1-90 DTE，具体 preset 才限制期限；legs 必须是实际存在、同 expiry、有 bid/ask 的 contracts；credit 必须按 short bid - long ask 为正；再按 DTE 风险、Delta、spread、OI、volume 和经济性评分。
- UI 不变量：没有完整达标候选就不显示 row；只显示选中订单的 expiry/DTE、legs、credit/debit、max loss、breakeven、RoR 和机会分。DTE range 只用于内部 coverage/debug。
- 测试：必须覆盖“snapshot 同时含 2 DTE 和 45 DTE 时默认选 45 DTE”、“负 credit 被拒绝”、“短线明确允许 2 DTE”、“Iron Condor 两侧同 expiry”。
- 追加不变量：`不限`不是“推荐一个最匹配策略”；它应返回所有已支持策略中通过门槛的组合，同一 symbol 可以有多条候选。所谓全部不包括不可执行或质量不达标的笛卡尔排列。

### 10. 不要用修复 dotenv 覆盖问题为理由硬编码 provider key

- 已确认问题：PM2 config 注入 `POLYGON_API_KEY=''` 会让 `load_dotenv` 认为变量已存在，从而跳过 `.env` 的真实值。
- 错误修复：把真实 key 直接写入 `ecosystem.config.cjs`。这会让凭据进入 Git 历史、文档和所有 clone。
- 正确修复：从 PM2 `env` 中完全移除该变量，让 collector 工作目录的 `.env` 提供它；云端使用平台 secret store。不要打印 key，也不要在测试 fixture 中使用真实 key。
- 运行验证：配置语法检查、repository secret scan、provider 使用脱敏 health check。已经进入 Git 历史的 key 必须由账户持有人 rotate。

### 11. 测试必须覆盖 server enqueue 到 collector worker 的跨边界契约

- Phase 3D-6 补测试时发现：worker 已支持 Polygon，但 API 仍默认 enqueue `tt_internal`；两个模块各自都能运行，整体行为却已经漂移。
- 回归要求：server 默认 provider 必须属于 server supported set，也必须出现在 worker supported set；placeholder provider 必须被拒绝。
- GEX 最低测试矩阵：Call 正/Put 负 exposure、walls 位于 spot 正确一侧、gamma flip 插值和 nearest-zero fallback、PCR denominator=0、confidence high/medium/low。
- API 最低测试矩阵：seeded snapshot 返回完整字段；missing enqueue 后返回 missing；stale 返回旧数据并只异步 enqueue，不允许请求路径调用 provider。
