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
- IV Rank describes a relative historical range; it is not, by itself, a buy/sell signal. Any strategy comparison also needs event risk, realized volatility, term structure, skew, liquidity and transaction-cost assumptions.

### Greeks intuition
- **Delta**: how many shares of stock this position behaves like
- **Gamma**: how fast delta changes (high near expiry, near ATM)
- **Theta**: under unchanged model inputs, the approximate theoretical value change as one day passes. Its realized P/L effect depends on the whole position, volatility, spot path and repricing.
- **Vega**: P&L per 1% increase in IV (positive for long options)
- **Rho**: P&L per 1% increase in interest rates (usually small, matters more for LEAPS)

### Key strategy selection heuristics

The table is a research starting point, not a recommendation or a claim of expected profitability. Defined-risk structures are generally easier to bound than naked short options, but still carry material loss risk.
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
- **Take profit early**: some rule-based studies test exits such as 50% of maximum modeled profit; this is not a universal optimum.
- **Loss management**: a multiple of credit is one possible risk rule, but it should be selected, tested and sized for the specific structure and portfolio.

## 期权实战交易框架（V2 扫描器设计依据）

### 核心认知：正股是1维，期权是3维

正股只需判断**方向**。期权需要同时判断：
- 方向（涨/跌/横盘）
- 幅度（涨多少）
- 时间（什么时候到）
- IV 水平（买入时贵不贵）

方向对了但幅度不够、时间不对、买入 IV 太高——照样亏钱。

### 两种交易哲学

**权利金卖方（Premium Seller）— 风险与溢价的权衡**

逻辑：在部分市场、样本和期限中，隐含波动率会高于后续实现波动率；两者的差异常被称为**波动率风险溢价（Vol Risk Premium）**。它会随标的、事件、期限和市场状态变化，并非保证可捕获的收益。

```
历史数据示例（SPY）：
  30日 IV 均值 ≈ 16%
  30日 RV 均值 ≈ 13%
  差值 ≈ 3% → 一个历史样本中的差异，不代表未来结果
```

- 胜率、尾部损失和回撤高度依赖入场、管理、成本与样本；卖方结构可能出现大额或快速亏损
- 代表策略：Iron Condor, Credit Spread, Strangle, Covered Call

**买方（Premium Buyer）— 低胜率但非对称**

- 需要：方向对 + 幅度够 + 时间内到 + IV 不能太高
- 适合：有明确 catalyst（财报/FOMC）且 IV 处于历史低位时

### 常见的规则化研究框架（示例，不构成交易规则）

```
过滤条件：
  IVR > 50（IV 相对历史区间较高；不代表一定均值回归）
  流动性好（bid-ask tight，OI > 1000）

开仓：
  DTE 约 45 天（常见研究窗口之一，仍需考虑事件日与期限结构）
  短腿 Delta = 0.16 ~ 0.30（常见区间；不是胜率承诺）
  用 defined-risk 结构控制最大亏损（Spread / Condor）

管理规则：
  可研究在模型利润达到某一比例时退出、在某一风险阈值时减仓、或在到期前滚动；这些阈值需要针对策略、流动性和账户规模验证

仓位规模：
  以预先定义的最大损失、相关性和流动性约束确定仓位；具体比例不应脱离账户规模与风险承受能力照搬
```

**为什么 50% 平仓？**
部分历史回测会比较不同获利退出点和持有到期的结果；结论会随标的、时期、交易成本和执行假设变化，不能据此推断任何单笔交易的结果。

### 真正的 Edge 来源

| Edge | 原理 |
|---|---|
| Vol Risk Premium | 部分样本中 IV 与后续 RV 的差异；是否可交易取决于尾部风险、成本和模型 |
| IV 均值回归 | 高 IV 可能回落，也可能因事件或市场状态继续上升 |
| Theta 模型效应 | 在其他模型输入不变时的时间价值近似变化，不等于实际损益保证 |
| 结构优化 | 相同方向判断，用对结构可提高盈亏比 |

### 常见死法

| 死法 | 原因 | 解法 |
|---|---|---|
| 事件后 IV 重估 | 财报前后 IV 可能显著变化 | 明确事件风险，比较不同结构与 Vega 暴露 |
| 裸卖被黑天鹅 | 卖 naked，遇单边暴动 | 永远用 defined-risk（spread）|
| 仓位集中 | 多个相关标的同方向 | 分散，控制 portfolio-level Greeks |
| 缺少退出计划 | 风险超过预设承受范围 | 预先定义、回测并持续复核风险退出逻辑 |
| 临近到期的 Gamma 风险 | DTE 很低时 Delta 对价格变化更敏感 | 按策略、流动性和组合风险评估是否减仓、滚动或持有 |

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
- API 全部失败：不显示分析结构；页面只显示 API unavailable。生产 Analyze 没有 mock fallback。

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

当前公式（产品口径：标的变动 1% 时的模型估算 Delta-dollar exposure）：
- Call GEX = `gamma * open_interest * contract_multiplier * spot^2 * 0.01`
- Put GEX = `-gamma * open_interest * contract_multiplier * spot^2 * 0.01`
- 单位：`usd_delta_change_per_1pct_move`；不代表现金流、PnL 或 dealer 实际持仓金额。
- Call 正号 / Put 负号是 `call_positive_put_negative_proxy` dealer positioning 代理假设；公开 OI 无法识别真实 dealer side。
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
- GEX API 必须返回 `raw_metrics.unit`、`raw_metrics.formula`、`raw_metrics.positioning_model` 和 `raw_metrics.positioning_assumption`，页面需要把 GEX 标记为模型估算。
- GEX 不能只以数值字段在不同产品间传播。Analyze、Scan 与 Weekly 的 GEX DTO 都必须带同一份 `gex_metadata`：模型版本/单位/代理假设、快照时间与数据状态、合约覆盖范围、计算参数。这样每个展示点都能追溯到具体快照，而旧 Scanner 行缺少 metadata 时必须显示 `partial`，不能用当前默认配置猜测历史模型。
- Gamma Flip 重算必须使用 option-chain snapshot 的估值日期，而不是 job 运行当天。否则同一历史链会因剩余 DTE 改变得到不同曲线，不能复现或比较。
- 数据详情属于研究结果的一部分，而非调试装饰。默认收起能保持 Scan 的可读性；展开后用户必须能看到口径、快照时点、覆盖质量、到期范围与定位代理假设，才能正确理解 GEX 数值。
- GEX 验证要区分两件事：固定 fixture 验证“代码是否按既定公式计算”，数据库 replay 验证“保存值能否由同一快照重现”。两者都不能证明 dealer 实际仓位或价格预测能力。SPY/AAPL replay 已核对 Global/Local GEX、Flip、Walls 与 Max Pain，但结论仅限计算一致性。
- 当前模型版本为 `gex-v2-1pct-positioning-proxy`；不同模型版本的 GEX 数值不能直接做历史比较。
- 部署重算：`GEX_RECOMPUTE_ALL=true GEX_SYMBOLS=<symbols> venv311/bin/python compute_gex.py`，随后重新 materialize scanner rows。
- scanner 已可读取 latest GEX snapshot 做 Gamma regime / Wall proximity / Local Gamma / OI / Volume / Volume-to-OI filters。
- Scanner 的 IV/trend/GEX 用于 context、过滤和解释；`不限`必须跨所有已支持策略枚举达标 contract setups，不能先把一个 symbol 压成单一策略。
- OI delta 异常需要连续 snapshot 历史；当前 Volume-to-OI 只能作为活跃度 proxy。
- licensed provider 第一候选是 Massive/Polygon options snapshot，第二候选是 Intrinio；真正上线前必须确认 OPRA/options display 与 redistribution 权利。
- Phase 3C 后，`/api/scan` 不再做 request-time full watchlist aggregation；scanner rows 由 `collector/materialize_scan.py` 预计算进 `scanner_results_snapshots`。
- stale/missing API responses 只 enqueue `provider_fetch_jobs`，不在用户请求路径同步调用 provider。
- `collector/run_refresh_worker.py` 是 refresh job 执行边界；`provider_request_usage` 记录每日 provider budget；`/api/admin/status/cache` 用于观察 backlog、failure、stale scanner、empty snapshot。
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
- 修复：2026-07-16 删除 `frontend/src/data/mockAnalysis.js`，并以 `createRealAnalysis` 创建所有-null 的 production base。typed symbol 不允许 API 失败时回退到本地 mock；missing/unusable GEX 清空 Wall、strikes、scenarios 和策略腿；stale/partial 且字段完整才显示实际数据并加质量提示。
- 测试：frontend regression test 断言 Analyze 不得 import/use `mockAnalysis`；数据转换 tests 覆盖 fresh、stale、missing、low-confidence 四种状态。

### 3.1 scanner SQL 的列名必须始终限定来源

- 2026-07-16 事故：`GET /api/scan` 的 CTE 同时包含 `latest_rows.source` 与 `latest_community_batch.source`，final `SELECT source` 未限定，PostgreSQL 报 `column reference "source" is ambiguous` 并返回 HTTP 500。
- 修复：final select 的 scanner fields 全部显式绑定 `latest_rows`，包括 `latest_rows.source AS source` 和 `latest_rows.snapshot_ts AS snapshot_ts`；freshness CASE 同样使用 `latest_rows.snapshot_ts`。
- 防回归：scanner route test 对实际 SQL 字符串断言该 qualification；部署后必须以生产 `/api/scan` HTTP 200 + 非空 rows 做 smoke，mocked pool test 不能证明 PostgreSQL 能解析 SQL。
- 生产验收：修复后 `/api/scan?minIvr=40&maxIvr=100&limit=5` 返回 HTTP 200 与真实 scanner rows；Vercel scanner 页面可实际渲染 1,700 个报价候选。

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

### Remember-token successor persistence (2026-07-16)

- **Confirmed from runtime output**：一次 TT `POST /sessions` 返回 201 后，紧接着使用旧 remember-token 的 collector 请求返回 401。响应模型包含 session-token 与 remember-token 字段。
- **Root cause**：旧 collector 只缓存 session-token，丢弃成功响应内的 successor remember-token；one-shot cron 的下一次启动因此拿到旧状态。
- **Fix**：以 PostgreSQL `provider_auth_state` 为唯一 token state。collector 先取得 transaction advisory lock；201 后原子提交 provider 返回的 successor（无 successor 则提交当前 token）；401/403/网络失败 rollback，不进行密码 fallback 或任意 token rotation。
- **Recovery correction**：`TT_REMEMBER_TOKEN` 只允许 bootstrap 一个不存在的数据库 row。数据库 token 明确 401/403 后立即停止，不能再用环境 seed 发第二条请求；这样一个 cron run 不会意外消费两份 token state。Railway 变量若被粘贴为带成对引号的文本，代码会在 bootstrap request 前剥离引号。日志记录不可逆 fingerprint 与 `COLLECTOR_RUNTIME`，用于定位消费路径而不泄露凭据。
- **Deployment lesson**：Railway cron 容器是短生命周期，持久状态应在数据库而不是 `/data` Volume。但“共享”以同一 `DATABASE_URL` 为前提：本机手动登录写入的 seed 不会自动出现在另一个 Railway PostgreSQL binding。Railway 空状态必须由它自己的 `TT_LOGIN` 与 `TT_REMEMBER_TOKEN` bootstrap；成功 exchange 后才写回 successor，无需反复更新 Railway Variables。缺 `TT_LOGIN` 属于本地配置错误，必须在 HTTP 请求前 fail closed。

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
- **解法**：从 `ecosystem.config.cjs` 删除该 key，让 `load_dotenv` 从 `.env` 读取；部署平台则用 secret store。禁止把真实 key 写死到 PM2 config。
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

### 12. Health endpoint 不等于 operator alert

- `/api/admin/status/cache` 只能在有人主动查看时暴露 degraded；它不会主动通知，也不保存同一故障是否已经通知。
- Collector health check 必须复用明确阈值，并把 issue code + affected symbols 做 fingerprint。否则每 5 分钟发一封相同邮件会让告警失效。
- Snapshot 表里“有 row”不等于 covered：`contract_count=0`、`metadata_only`、stale、低 completeness 必须分别判断。
- 告警本身不得阻断采集。Webhook/SMTP 失败写 error 并降级到日志；collector 下一轮继续运行。
- Runtime 证据：67/67 snapshot coverage、0 stale、0 incomplete；31 个 24h 历史 failed jobs 触发一次 alert，第二次检查被 cooldown 正确抑制。

### 13. Polygon 多 symbol backfill 必须共享 limiter，并交给进程管理器

- **现象**：AAPL 单 symbol 日线/30M 都成功，但直接循环 67 symbols 时在第三个 symbol 开始连续 429；短 backoff 重试只会继续消耗请求并失败。
- **根因**：Stocks aggregates entitlement 有独立 rate limit。每天两个 timeframe 意味着每个 symbol 至少两个请求；若 limiter 只存在于单次 HTTP retry 或每个 symbol 新建 provider，无法约束全局请求速率。
- **修复**：一个 `PolygonPriceProvider` 实例服务整轮 watchlist；`PolygonStockRequestPacer` 通过 file lock 在 option `/prev` 与 price aggregates 两个 PM2 进程之间共享 `POLYGON_STOCK_REQUEST_DELAY=16`。Runtime 显示 13 秒会在每 4 个请求后触发 429，16 秒可保持低于 observed 4 req/min ceiling。429 优先尊重 `Retry-After`，否则按长 backoff 等待。
- **运行坑**：长 backfill 不能依赖 Codex/SSH 的临时前台 exec；会话被回收后 Python 子进程既可能终止，也可能变成没有可见 session 的 orphan。后者会继续消耗 provider quota，并与 PM2 job 互相制造 429。交给 PM2 临时 one-shot process；切换前用 `ps ... | rg '[c]ollect_prices.py'` 核对 PID/PPID，只终止明确的旧 orphan。完成后查询 PostgreSQL coverage，再删除临时 process。
- **环境不变量**：scheduled process 固定 `SYMBOLS=watchlist`。Targeted backfill 的 symbol 列表不能残留到下一次 cron。Key 只能从 `.env`/secret environment 注入，检查时只输出 configured boolean。
- **最终证据**：清理 orphan 后 16 秒 cadence 稳定、最后 23 symbols 0 failed；Railway daily/30M 均 67/67、无 duplicate key。PM2 对 ecosystem reload 不会自动把 shell secret 合并到另一个 app，必须对具体 process 执行 `restart --update-env`，再检查 `key=True`（只输出 boolean）并 `pm2 save`。

## Derived Volatility Lessons (2026-07-15)

- **原始数据与派生数据不要混表覆盖**：`iv_history` 保存 provider observation，`volatility_history` 保存可重放的 Polygon-derived HV/ATM/rank。这样 fallback、来源审计和 rollback 都是字段级行为。
- **交易日不能用 UTC `::date`**：美东晚间 snapshot 已进入次日 UTC。曾导致真实 30 DTE 合约在 SQL 中成为 29 DTE，并让 QQQ ATM IV 完全缺失。统一用 `(snapshot_ts AT TIME ZONE 'America/New_York')::date`，并测试 SQL 不再出现 `snapshot_ts::date`。
- **总合约 cap 会形成期限偏差**：provider 分页通常先返回近月；简单 `contracts[:cap]` 会让远期 bucket 消失。先按 DTE bucket 选择 expiry，并在缺少 30–45 DTE 时做一次 bounded supplement，再应用总 cap。
- **有 snapshot 不等于字段完整**：验收必须分别统计 snapshot count、30–45 DTE contracts、IV non-null contracts、ATM coverage、rank readiness。只看到 `snapshots written` 不能证明 ATM pipeline 完整。
- **第三方指标不是公式 parity oracle**：同一 Polygon close 序列按明确公式计算的 HV 与 Tastytrade median difference 为 14.97pp/8.39pp/6.40pp。供应商可能使用不同价格、窗口、加权或年化口径；正确验证是固定输入的数学测试、来源隔离和 deterministic replay。
- **SQL 参数类型应显式绑定**：scanner 新增 feature flag 后，位置参数曾把 stale numeric threshold 绑定为 boolean。用单行 `settings` CTE 固定布尔参数，并以 Railway 实库 materialization 作为回归验证。
- **readiness 必须 fail closed**：当前每 symbol 只有 1–2 个 ATM market-day observations，0/67 满 252。系统继续使用明确标注的 Tastytrade cold-start rank，不能用短历史的 min/max 伪造 52-week IV Rank。

## Scanner Strategy Lessons (2026-07-15)

- **“最新 snapshot”不是单一排序问题**：Polygon 最新快照有 Greeks/OI 但 0 bid/ask；直接 `DISTINCT ON symbol ORDER BY snapshot_ts DESC` 让 55 个已有真实报价的标的全部变成空 scanner。Positioning 和 quote 必须各自选择最新可用 snapshot。
- **报价必须带自己的 provenance/freshness**：不能把 GEX source 或 scanner materialization time 当作 legs 的报价时间。API 增加 `quote_source/quote_snapshot_ts/quote_freshness`。
- **DTE 也受 UTC 午夜影响**：SQL 中 `expiry - CURRENT_DATE` 在美东晚间会提前减一天。scanner 与 ATM pipeline 都统一到 `America/New_York` market date。
- **策略名不是产品输出**：每个 candidate 必须携带实际 legs、near/far expiry、sell bid、buy ask、credit/debit、max loss 或明确 undefined risk、breakeven 和 opportunity score。
- **候选算法不能作为前端实现细节**：`scanOpportunity.js` 曾把完整 raw chain、策略枚举、评分权重与经济性计算发送到浏览器。自 2026-07-16 起，这些逻辑由 `server/src/domain/scanner/candidateEngine.cjs` 执行；正常 `/api/scan` 仅返回 display-ready candidate DTO，不返回 `option_contracts`。这既减少 payload，也建立产品算法边界。
- **source map 必须显式关闭并验证产物**：只依赖 Vite 默认行为不足以构成发布策略。生产配置显式为 `build.sourcemap=false`，验证必须检查实际 `dist` 没有 `.map` 文件。
- **跨期结构要测试腿方向**：Calendar/Diagonal 固定 near short、far long；只测试“返回 Calendar”无法发现 expiry 反向的灾难性错误。
- **裸卖风险必须是产品状态**：Short Strangle/Short Put/Short Call 不因用户选择“策略不限”而静默出现；必须显式开启 advanced-risk gate。
- **全量 lint 与改动 lint 分开报告**：早期 section 只证明 changed-file lint；遗留错误后来由独立 P2.4 commit 清零，不能倒写成早期 section 当时已经通过。

## Analyze Data Product Lessons (2026-07-15)

- **PostgreSQL DATE 不能用 `String(value).slice(0, 10)`**：node-postgres 默认可返回 `Date`，结果会变成 `Wed Jul 15`，不仅 UI 错，lexicographic expiry sort 也会错。统一优先 `value.toISOString().slice(0, 10)` 并用真实 `Date` fixture 测试。
- **当日日线 volume 不是完整日成交量**：收盘前将它与过去完整日均量计算 RVol，会得到极低假信号。纽约当前交易日的 daily RVol 保持 null；30M 参与度应在独立 intraday 信号中计算。
- **最新 chain snapshot 未必适合所有派生指标**：chain stats 应选择最新“至少有真实 IV contract”的 snapshot，而不是无条件最新 row；source/time/freshness 跟随被选择的 snapshot。
- **S/R zone 与 Wall 是不同证据**：S/R 来自历史价格 pivot；Call/Put Wall 来自期权持仓结构。UI 可以并列比较，但不能合并成同一来源或互相冒充。
- **Volume Profile 不是逐笔成交归因**：当前实现将每根 30M 或日线 bar 的典型价 `(H+L+C)/3` 归入一个价格桶并累加该 bar 全部成交量。因此 POC、70% Value Area 和 LVN 都是该聚合方法下的近似成交结构，不能被表述为精确的逐价逐笔 volume，也不能自动等同于支撑、压力或期权 Wall。
- **Confluence 强度不是成功概率**：当前 `confluence-v1-prior` 仅把六类离散价位按 ATR 半径聚类，模块分数取固定冷启动上限并保留最高一条理由。它表达“哪些模型输入在同一区间重叠”，不是经拟合的胜率、精确支撑阻力，也不能单独作为交易触发条件；CF-3 必须用历史回放检验它是否优于现有单点 S/R。
- **更高守住率不等于更好的模型**：2026-07-18 的 G5 全样本回放中，Confluence 的触及后守住率从 `46.44%` 升至 `50.07%`，但反转点召回从 `27.30%` 降至 `22.14%`，综合为 `-2.07%`。因此不能挑选单项好看的数字上线；gate 要求两项均改善且综合提升至少 15%。
- **Zone-vs-点位对比自带几何混杂，harness 必须对齐几何再比**：同一次 G5 复核发现两个方向相反的偏差——候选只取 top-1 Zone 而控制组用最多 3 条带/侧（触及机会不等，召回对控制组结构性有利）；ATR 宽 Zone 天然比 ±0.5% 窄带更容易"守住"（守住率对宽 Zone 有利）。两者恰好各偏向一方，让单项指标都不可单独采信。教训：对比不同形态的价位模型时，先对齐 Zone 数量与宽度（或改用宽度无关的评分），否则回放结果只是几何差异的回声。本次因 gate 结论保守（未上线）不需返工；v2 重跑前必修，详见 `docs/validation/CONFLUENCE_G5_2026-07-18.md`。
- **OBV 是方向性累计，不是资金流金额**：收盘高于前一日时加上该日成交量，低于前一日时减去，收平时不变。它适合用来检查价格方向和成交量是否同步；不能据此推断买方金额、卖方金额、机构持仓或逐笔订单方向。
- **MFI 的“资金流”是技术指标口径**：它由典型价和成交量的正负变化得出，并不追踪现金从谁流向谁。高于 80 或低于 20 只说明过去 14 个变化中的价格-成交量关系极端；应与 RSI、趋势和结构位共同判断，不能自动视为反转交易信号。
- **没有真实合约候选就不显示策略腿**：用 spot ± width 或 wall ± width 合成腿会制造不存在、无报价或错 expiry 的订单。Analyze 只展示结构数据，具体腿必须来自 scanner/contract candidate attachment。
- **图表空状态优于 deterministic mock**：固定 seed 的示例曲线看起来稳定，仍会被用户理解为真实走势。真实 OHLCV 少于最低门槛时直接显示 unavailable。

## Universe and On-Demand Lessons (2026-07-15)

- **Watchlist 是 ingestion seed，不应是产品 universe**：持久化 registry 可以同时容纳已知数据库 symbols、运营配置和用户按需发现的 ticker，scanner 仍读取 materialized snapshot。
- **按需请求必须按字段判断 coverage**：一个 symbol 可以已有 price/options/GEX 但缺 metrics。把 symbol 简化成 available/unavailable 会隐藏可用产品并反复采集已有数据。
- **非重试错误不能靠页面刷新重试**：TT manual-login failure 若每次 Analyze 都 enqueue，会形成稳定失败队列。保存最近失败并返回 field blocker，恢复后再显式重试。
- **动态 universe 不等于请求时全市场扫描**：用户请求只允许注册和补一个 symbol；全量排序仍由后台 materializer 写 `scanner_results_snapshots`。
- **schema/filter 完成不代表字段已覆盖**：market cap、sector、optionable 必须有独立 population 验收。2026-07-16 之后 reference coverage 为 77/78，但 market cap 只有 27、SIC-derived sector 28、optionable true 69；用户启用这些过滤时 null 仍 fail closed，不能用默认值伪造。
- **optionable 只能由真实快照证明**：reference/ticker metadata 不等于有可交易期权链。当前实现只在存在 `contract_count > 0` 且非 `empty`/`metadata_only` 的 option snapshot 时写 true；无证据保持 null。
- **reference provider 的行业字段要标明口径**：Polygon ticker reference 给 SIC，不给完整商业 sector taxonomy。项目使用 `sec_sic_derived_v1`，文档/UI 必须知道这是派生分类。
- **PM2 cron one-shot 会启动一次**：`pm2 startOrRestart ecosystem.config.cjs --only <cron-app>` 会立即跑一轮；已经手工 backfill 后要停掉进程并保存，保留 cron active。
- **运行验收要验证闭环而非只看 enqueue**：COST 从未知 symbol 变成 78th registry row，随后获得日线/30M、54 actual contracts 和 fresh GEX；第二次请求 queue depth 为零，证明 persistence 和 dedup/blocker 均生效。

## Market and Weekly Lessons (2026-07-15)

- **30M 必须先限定 regular session**：包含盘前/盘后 bars 会让 range、成交量基准和最后一根 bar 全部失真。SQL 先按 New York 09:30–16:00 过滤。
- **突破信号必须校验跨 timeframe 日期**：daily 已到 7/15、30M 仍停在 7/14 时，即便价格和量能满足公式也只能返回 stale，不能确认 breakout。
- **OI 变化不是资金流**：`SUM(oi_delta)` 的单位是合约，不是美元，也不能判断 opening buy/sell。Weekly 将“Smart Money”改为“仓位变化”。
- **OI 不是每轮报价都会变**：同一交易日内反复保存的 option snapshot 常有完全相同的 OI。ΔOI 必须拿最新快照与同一 provider 的前一纽约交易日快照比较；把今天 10:00 与今天 13:00 相减得到的 `0` 不是有效的仓位结论。没有前一交易日基线时，UI 应显示 `待下一交易日`，不能显示 `0 / 0`。
- **Wall 与 GEX 必须用现价语言表达**：`Call 4.5%` 没有说明 Wall 在哪里。应该显示为 `上方 Call Wall $价位（+距离）` 或 `下方 Put Wall $价位（-距离）`。`净 GEX` 是把 Call Gamma 计正、Put Gamma 计负后的模型汇总，不是资金流；负 Gamma 表示波动可能放大，正 Gamma 表示波动可能收敛，且要同时显示快照是否延迟。
- **Wall 需要方向有效性**：Call Wall 在现价下方不能作为向上突破，Put Wall 在现价上方不能作为向下跌破。先检查相对 spot 的方向，再 fallback 到真实 S/R。
- **历史快照少就显示少**：AAPL 当前只有一个可用 GEX market day。Gamma migration 显示一日，不复制成 Mon–Fri 假历史。
- **滚动五交易日比硬编码 Mon–Fri 更稳健**：节假日、周中运行和缺失交易日不会导致填充不存在的 candle。

## Product Entry Lessons (2026-07-15)

- **数据产品入口应先展示工作流**：首屏直接进入 Scan/Analyze/Weekly，比罗列技术能力更能说明产品用途。
- **真实产品画面比装饰图更可信**：hero 使用 scanner 结果截图，live strip 再读取当前 regime；视觉与运行数据来源分开，API 失败不影响导航。
- **Home 不能抢占工具的信息密度**：入口可以有强品牌尺度，进入 scanner/dashboard 后仍保持紧凑操作界面。
- **移动端首屏要保留下一段提示**：hero 与 live strip 使用稳定高度和 2-column mobile grid，workflow section 不被无限长首屏吞掉。

## Scanner Alert Lessons (2026-07-15)

- **通知要有 durable outbox**：直接“算完就发”无法区分发送前崩溃与发送后崩溃。先插入 unique delivery，再更新 sent/blocked/failed，至少能审计和抑制重复。
- **未配置 channel 不是发送成功**：SMTP/VAPID 缺失时必须写 blocked，UI 只能说 subscription saved，不能说 message delivered。
- **Web Push 只把 public key 给浏览器**：VAPID private key 属于 Mac collector secret；Service Worker 只负责展示 payload 和打开产品链接。
- **规则字段缺失应 fail closed**：用户要求 `min_iv_rank=50` 而 row 没有 IV Rank 时不能命中。
- **退订不应暴露 destination**：随机 token 足够完成当前匿名阶段的撤销；用户 auth 上线后再把 subscription 归属绑定到账户。
- **通知 evaluator 不能调用 provider**：只消费 materialized scanner batch，避免用户数量放大外部请求成本。

## Heartbeat Lessons (2026-07-15)

- **不能只查询已经存在的 heartbeat rows**：机器从未成功启动时数据库没有 row，这正是最需要告警的状态。监控必须从 expected-node registry 与 observed rows 做并集。
- **进程在线不等于数据健康**：heartbeat 证明 Mac daemon 可达；option coverage、snapshot freshness 和 provider failures 仍由 collector health 独立判断。
- **上报与告警必须解耦**：Mac 只发送小型状态包；Railway 决定 timeout、cooldown、active/resolved lifecycle，避免断线机器负责宣告自己断线。
- **缺通知 secret 应记录 blocked**：数据库 incident 仍是有效证据，但不能把未发送 webhook 写成 sent。
- **运维功能必须 disabled-safe**：URL/token 未配置时 heartbeat 返回 disabled，collector 主循环继续工作；这样分阶段部署不会中断数据采集。
- **验收要走完整状态机**：测试 missing、错误 token、online、受控 stale、active incident、恢复、resolved，而不只是确认 POST 返回 200。

## Derived Provider Cutoff Lessons (2026-07-15)

- **读取 derived 不等于停止采集 provider**：consumer preference 与 producer scheduling 是两个控制面，必须同时实现。
- **在认证前过滤**：如果先登录 TT 再发现全部 symbol 已 ready，仍会产生无意义认证流量和设备 challenge 风险。
- **切换应按 symbol 而非全局日期**：新加入的 symbol 仍需要冷启动，历史较长的 symbol 可以先独立停止 provider rank。
- **队列中旧 job 也要短路**：只修 scheduler 不能阻止已排队或按需创建的 metrics job。
- **时间门槛不是代码 TODO**：252 个独立市场日尚未自然积累属于运行状态；测试可用确定性序列验证逻辑，但生产不能伪造 observations。

## Railway Cron Lessons (2026-07-15)

- **Cron workload 必须 one-shot 并退出**：把长期 daemon 当 Railway cron 会让后续 schedule 被跳过。
- **Railway cron 使用 UTC**：固定“美东 16:30”会受 DST 影响；选择全年都在美股收盘后的 22:30 UTC 更稳健。
- **monorepo service 必须明确 config path**：metrics cron 使用 `/collector/railway.metrics.json`，不能继承 Node API 的 start command。
- **镜像不能 COPY secret/venv**：`.dockerignore` 排除 `.env` 和 60MB 本地 virtualenv，secret 只由 Railway variable 注入。
- **build passed 不是 cloud run passed**：容器与配置可在代码侧验证；service binding、secret 和首个 completed deployment 必须有 Railway 项目权限。
- **config 文件位置不改变 Docker build context**：`/collector/railway.metrics.json` 被 Railway 读取时，构建 context 仍是仓库根目录。把 Dockerfile 写成相对 `collector/` 的 `COPY requirements.txt` 会在云端找不到文件；必须显式使用 `collector/Dockerfile.metrics`、`COPY collector/requirements.txt` 和 `COPY collector/`。本地以 `docker build -f collector/Dockerfile.metrics ... .` 覆盖这一点。
- **cloud cron 首跑必须记录 provider 与 DB 两个边界**：2026-07-16 的手动 run 已证明容器可连 Railway PostgreSQL 且能加载 67-symbol watchlist，却在 TT session exchange 的 `401 invalid_credentials` 退出。Railway token 曾被配置为包含字面引号；去除后，数据库当前 state 仍被 TT 401。故障不是 Railway 网络、Docker 或 PostgreSQL。修复后，已存在 state row 只会产生一条认证请求；以 fingerprint/consumer 日志定位后续实际消费者。不能把 failed run 误记为已写入；只有日志确认 authentication/写入并验证 `iv_history` 与 `provider_auth_state.updated_at` 后才可宣称 cloud run 成功。
- **cloud host can be an untrusted TT device**：本机用既有账号登录成功并把 fresh token 写入 shared PostgreSQL 后，Railway 使用相同 fingerprint 的一次 exchange 返回 `403 device_challenge_required`。这证明当前失败不是 token/数据库/网络，而是 TT 的设备信任边界。结论：TT metrics 继续由受信任的 Mac Studio 执行并写 Railway PostgreSQL；不要以无界重跑 cron 试图跨过 device challenge。
- **runtime gate prevents a known-bad scheduled call**：Railway image defaults `TT_METRICS_ENABLED=false`; `collect.py` exits before watchlist loading, database work, credential reads or TT traffic. The local default remains true. This keeps the deploy artifact reproducible without allowing a scheduled cloud invocation to repeatedly trigger the same device challenge.

## Mac Power Recovery Lessons (2026-07-16)

- **自动重启设置与供电持续性是两项独立控制**：`pmset -g custom` 已确认 AC Power `autorestart 1`，所以市电恢复可启动机器；它不提供断电期间的续航。
- **开机不等于进程恢复**：还需验证 LaunchAgent。当前 `pm2.congrenhan` 在 `RunAtLoad` 运行 `pm2 resurrect`，且 `dump.pm2` 含五个 Quantrift collector apps；只有这两个条件同时满足，机器恢复后采集进程才会自动回来。
- **UPS 验收必须是恢复演练**：接入 UPS 后要受控地验证 Mac、IB Gateway、PM2 process list、collector health、队列和数据库最新 snapshot 全部恢复，不能只把“已购买 UPS”当完成。

## IB Gateway Cloud Evaluation Lessons (2026-07-15)

- **IB API socket 不是普通公网 API**：它是未加密、未认证的 raw TCP；4001/4002 只能留在 localhost 或受控私网。
- **固定出口 IP 是身份稳定性的一部分**：短生命周期 PaaS egress 变化会放大异常登录和 2FA 运维风险。
- **Gateway 是有状态长期进程**：需要 settings volume、nightly restart、2FA timeout policy 和 reboot recovery，不适合 cron。
- **先 paper/read-only 再谈迁移**：数据采集迁移不应顺带开启下单权限。
- **镜像必须 pin 版本**：`stable`/`latest` 自动漂移会让 Gateway/IBC 变化绕过回归验证。
- **真正验收是 soak test**：容器能启动不证明 2FA、重连、clientId、stale-data 和夜间重启可靠。

## Clerk Auth Lessons (2026-07-15)

- **外部身份与产品账户要分层**：Clerk user ID 是认证 identity；plan、entitlements、positions 属于本地业务数据库。
- **API 鉴权不应 redirect**：浏览器 API route 返回 JSON 401/503，登录跳转由前端负责。
- **authorized parties 必须显式配置**：只验证 token 签名而不限制来源会扩大跨站 token 风险。
- **部分部署必须可控**：没有 publishable key 时前端不挂 ClerkProvider；没有后端 keys 时 protected API fail closed。
- **建表代码不等于 migration applied**：先执行 additive migration，再用 `information_schema` 只读核对目标表；2026-07-15 的 P3 五张表完成了这两个步骤，真实登录仍需单独验收。

## Portfolio Lessons (2026-07-15)

- **持仓 ownership 必须进 SQL predicate**：前端隐藏按钮不是授权；list/update 都要绑定 user_id。
- **entry price 不能当 current mark**：没有匹配报价时 P/L 必须 unavailable，否则静止的假估值会误导用户。
- **组合 Greeks 要保留方向和 multiplier**：long/short sign、leg quantity、position quantity、100 contract multiplier 缺一不可。
- **部分报价不能生成完整 summary**：即使三条腿有价格、第四条缺失，组合 P/L/Greeks 仍应标记待报价。
- **请求路径只读快照**：Portfolio 不同步请求 provider；身份匹配使用真实 symbol/expiry/strike/right，不构造不存在的合约。
- **close 不是 delete**：保留 opening legs 和时间字段，才能支持后续历史 P/L、复盘和审计。

## Stripe Billing Lessons (2026-07-15)

- **success redirect 不是支付证据**：用户可以直接访问 URL；plan 只能由签名 webhook 更新。
- **webhook 必须保留 raw body**：全局 JSON parser 先运行会破坏 Stripe signature verification。
- **event idempotency 与业务更新要同 transaction**：否则 crash/retry 可能重复升级或留下“已处理但未更新”的状态。
- **past_due 不应保留 Pro entitlement**：产品访问由 plan + lifecycle status 共同决定。
- **enforcement rollout 要双向准备**：后端 gate 上线前，所有前端数据 fetch 必须携带 Clerk token；只改一边会让付费用户全站 401。
- **payment identifiers 不是前端数据**：Account API 不返回 Stripe customer/subscription IDs，Portal 由受保护后端创建。
- **customer 创建也需要幂等边界**：同一用户并发点击升级时，先锁定本地 subscription row，再检查或创建 Stripe customer；仅靠 `UPDATE ... WHERE stripe_customer_id IS NULL` 会留下多余 customer。
- **回滚优先 feature flag**：billing schema/event audit 保留，关闭 enforcement 即可恢复公开访问，不手工改账单状态。

## Frontend Verification Lessons (2026-07-15)

- **一次性 effect 也不能隐藏 stale closure**：Analyze 用 `useEffectEvent` 读取最新 handler，同时只消费初始 URL symbol。
- **异步初始化要有 unmount guard**：Portfolio 在 token 和数据 promise 完成后再更新 state，组件卸载后不写回。
- **service worker globals 要显式**：使用 `self.clients`，既符合 worker runtime，也避免依赖浏览器隐式全局。
- **lint、tests、build 各证明不同事情**：本节三项均通过；Vite chunk-size warning 仍是性能信息，不标成 correctness failure。

## OI Density Lessons (2026-07-15)

- **OI 不是 GEX**：界面标题写 OI 时只能消费真实 `open_interest`，不能把 signed gamma exposure 当作持仓密度。
- **不同数据产品要独立选 snapshot**：最新 IV snapshot 和最新 OI snapshot 可能不是同一条；共享一个选择条件会让一种数据遮住另一种。
- **跨 expiry 聚合必须公开口径**：本产品按所有未到期 expiry 聚合到 strike，并返回 expiry/contract counts，用户不会误以为这是单一期权到期日。
- **真实 smoke 要报告数量级**：PLTR 返回 7 expiries、84 contracts、11 strikes、total OI 307,713，证明 UI 输入不是 mock 或空数组。

### 宽 OI 采集 + 全链 Max Pain (2026-07-23)

- **窗口宽度和采集内容是两个正交决策**：GEX 需要 Greeks/quotes,所以那条链必须窄(成本高);但 OI 图和 Max Pain 只要 OI,可以单独跑一条"只取 OI"的宽采集,不涨 GEX 成本。把两者混在一条链上,要么 OI 图稀疏(窄),要么 GEX 成本爆炸(宽)。
- **固定 % 或固定 strike 数在全宇宙必错一个数量级**:SPY IV 15% vs SOXL IV 189%,用同一个 ±X% 窗口,SPY 会圈进上百个无关 strike、SOXL 只圈到贴价几档。窗口必须按 `n_sigma×IV×√t`(预期波动)自适应,再 clamp 上下限兜底。live:SPY ±11% / TSLA ±36% / SOXL ±60%(触顶)。
- **稀疏近价 Max Pain 是错的**:真·Max Pain 要最小化全链 Σ(intrinsic×OI)。TSLA 窄链 9 档给 $370,宽链 62 档(看到 $350 的 4.8 万 put OI、$405/$460 的 call OI)给 $382.5。
- **两个 Max Pain 口径要显式区分,不能混**:GEX DTO 的 `gex_snapshots.max_pain`(窄链)保留不动;OI 图/Analyze 用新的全链 `oi_density.max_pain`。文档标明二者 strike 覆盖不同,否则读者会以为数据前后矛盾。
- **加一条网络采集必须 best-effort**:`fetch_oi_by_strike` 任意失败返回空并继续,绝不因为多了一次 OI 抓取而让整个 snapshot 挂掉。

## Reddit Trends Lessons (2026-07-15)

- **社区信号不能污染期权评分**：Reddit 热度是上下文列；缺失时 scanner candidate 和机会分保持不变。
- **ticker extraction 必须先有 universe**：只靠大写正则会把普通英文词当股票；ambiguous token 只有显式 cashtag 才接受。
- **同帖重复 ticker 只算一次**：防止标题/正文重复写 `$AAPL` 放大 mention count。
- **零提及不等于未采集**：batch freshness 属于整批采集；已完成 batch 中没有 symbol row 时返回 fresh + 0，只有 batch 不存在才是 missing。
- **401 与 429 的恢复不同**：401 只刷新一次 app token；429 尊重 bounded `Retry-After`，不并发重试或循环登录。
- **credential-gated job 要 disabled-safe**：无 key 的 PM2 cron 正常退出并写 disabled 日志，不制造 failure alert。
- **migration 与真实 provider 验收分开**：表、API missing contract 和 UI 都能先验证；没有 OAuth access 时不伪造 Reddit row。
- **disabled-safe 测试不能替代 enabled path**：此前无凭据时在 provider 初始化前退出，掩盖了 `scannable`/`scan_enabled` 列名错误；必须直接测试 database contract helper。

## External Flow Lessons (2026-07-15)

- **quiet 与 missing 必须由 stream heartbeat 区分**：某个 ticker 没有 sweep 不代表 collector 断线；只有 provider 本身近期有消息，才能把零事件写成 quiet。
- **dark pool 不能靠大额成交猜测**：只接受官方 TradeReport 的 TRF market center `L`/`2`，lit venue 的大单不得改标签。
- **事件流持久化必须幂等**：用 provider event ID + event type 去重，重连和 72 小时回放不能制造重复资金流。
- **连接参数不能从文档字段臆造**：消息 schema 公开不等于 broker URL、认证和 subscribe envelope 相同；这些由账户配置注入。
- **opening flag 只能原样表达**：`all_opening_trades=true` 可以显示 confirmed；false 表示未知，不能推断开仓/平仓或机构方向。
- **PM2 disabled worker 不应重启循环**：当前 PM2 未按预期尊重 `stop_exit_codes`，因此配置用一个每小时 sleep 的 idle process 保持稳定；启用后重启进程，真实连接异常由进程内 bounded reconnect 处理。

## Composite Momentum Lessons (2026-07-15)

- **多周期分数必须公开权重**：只给 84 分无法复核；API 同时返回 30M/1D/1W components 和 30/40/30 weights。
- **1W 应从真实日线聚合**：不能把“20 日变化”改名为周线；按 calendar week 取最后 close 后再计算 MA4/12。
- **分数和 freshness 是两件事**：AAPL 真实重放得到 84，但 30M 比日线落后一天，所以状态仍是 stale，UI 不把它写成当前确认。
- **历史门槛要覆盖每个 timeframe**：60 daily、12 weekly、26 intraday 任一不足都返回 missing，不用零分补齐权重。
- **分析 API 仍只读数据库**：`/api/sr` 增加第二个 bounded SQL query，不在用户请求时拉 provider。

## Strategy Library Export (2026-07-16)

- **导出必须使用当前 canvas 像素**：Payoff 图导出直接复用已按 devicePixelRatio 绘制的 canvas，因此 PNG 与当前可见的策略、参数和主题一致，不重算或截取页面。
- **导出行为应可脱离 DOM 测试**：`canvasExport` 将 PNG data URL 和浏览器下载拆开，单元测试覆盖 MIME、文件名与空 canvas 的 fail-fast 行为。
- **多 DTE 曲线必须按每条腿递减**：Calendar / Diagonal 的近月腿可能先到期，不能把所有腿粗暴设成同一个剩余 DTE。Payoff 图以最远腿为时间轴，逐腿扣除 elapsed days；到期腿转 intrinsic value。
- **策略对比不应改变编辑中的策略**：comparison 使用独立的两个 strategy ID，只读取模板摘要；主策略、腿编辑器和场景参数保持原样，避免“比较”操作悄悄重置用户正在研究的结构。
- **策略 IV 标签与实时数据必须分开**：sidebar 的 `IV LOW/MED/HIGH` 从策略模板的首个明确 IV 条件派生，表达“该结构通常适用什么 IV 环境”。它不是当前 symbol 的 IV Rank，实时数值仍由 Analyze 和 Scan 的数据接口提供。
- **移动端要改变页面流而非只缩字体**：策略库原本是固定高度三栏布局；在窄屏下 sidebar、主内容和参数面板必须进入普通纵向流，且策略列表保持有界高度，避免 88 个策略把主内容推到不可达位置。
- **概率锥与 POP 必须分开表达**：Payoff 图的蓝色阴影只描述由加权 IV 和最长 DTE 推导的 68% 终值价格范围；它不是策略盈利概率，因此在图例中直接标明“价格区间”，避免和 POP 混淆。
- **产品类别不能靠名称暗示合约规则**：FX 与指数策略可复用标准 Call/Put legs 和同一损益引擎，但模板必须告诉用户在实际交易时重新核对乘数、结算方式和行权价间隔，不能把股票示例参数当成交易指令。
- **策略说明需要可比较的最小数值契约**：所有模板至少暴露 IV、DTE、止盈与止损的数字阈值。原策略规则优先；只有原文完全没有数字时才追加统一基准，既补齐阅读体验，也不改写已有策略的行为说明。

## Scanner Expected Move / POP Lessons (2026-07-16)

- **Expected Move 必须说明输入和时间口径**：当前 Scanner 使用同一 expiry 的最近 ATM Call/Put IV 均值和 calendar-day `sqrt(T/365)`，并在 DTO 中声明模型版本、标准差、输入合约和快照时间；不能把它写成价格必然范围。
- **POP 不是固定策略标签**：只用真实 bid/ask 选腿形成的盈亏平衡点、已声明 IV、利率和到期日计算；缺少任一核心输入就返回 unavailable，而不是沿用 64/66% 之类的占位百分比。
- **跨期结构必须承认模型边界**：Calendar / Diagonal 没有一个单一到期日的静态 payoff，当前单到期 POP 模型不能假装给出精确概率，因此明确标记 unavailable。

## GEX Version Reconciliation Lesson (2026-07-16)

- **原始链存在不等于当前产品 GEX 可用**：GEX 公式/单位版本升级后，旧派生行必须被 API 拒绝，不能静默混用；但拒绝后若没有回填任务，用户会误以为 collector 没有采集。
- **版本迁移应重算派生层，不重拉行情**：collector 现在对最新 watchlist chain 做版本差异检查，并只从 PostgreSQL 重算 GEX/Wall/Flip。这样不会消耗 provider 配额，也不会在模型升级后留下整批“不可用”。
- **用户请求不能排在 watchlist 冷启动之后**：按需 Analyze 任务以显式 priority `100` 入队，worker 优先消费；否则每 5 分钟两个标的的后台补全会把一个具体用户输入拖到数小时。
- **缺 GEX 和缺期权链必须走不同任务**：已有链只做本地 `gex_recompute`，缺链才调用 provider。把两者混为一次 options fetch 会浪费请求，并延长恢复时间。
- **模型边界不能盖过产品解释**：先说“当前是正/负 Gamma 环境”和可能的盘面含义；公开 OI 的估算限制用一句放在后面。把“代理符号假设”放进答案主句，只会让用户读不懂结论。
- **策略候选不可在最后一层被清空**：期权链、报价和 GEX 都 ready 时，前端把 `recommendation` 设成 `null` 会伪装成数据缺失。完整链只应在后端候选引擎读取，Analyze 只消费服务端筛出的策略腿 DTO 和真实的无候选原因。
- **期权链完整度与可交易报价是不同条件**：GEX 只需要 Greeks/OI，策略腿还必须有有效 bid/ask。刷新调度若仅检查 `contract_count > 0`，会把无报价快照误判为完成，导致用户永远拿不到具体策略腿。
- **无报价快照必须走定向回退，不是重复同源刷新**：`require_quotes` 的 Polygon job 若没有有效 bid/ask，保留该快照供 GEX/OI 使用，再在同一 job 尝试 IB；所有 provider 仍无报价时以 non-retryable blocker 结束。不能用 mark、last 或收盘价补成假 bid/ask。
- **provider 原始 JSON 也属于采集事务的一部分**：TT/DXLink 事件可能含 `Decimal`。数据库列可以正常适配 Decimal，但 JSONB 不会；raw metadata 与 raw contract 必须在持久化边界统一转成 JSON 数字，否则“数据已获取”仍会因审计字段失败而整单回滚。
- **blocker 只能表达不可通过重试解决的状态**：无报价和认证失败适合短期阻断；代码或序列化错误不应被标记成数据不可用，否则部署修复后用户请求仍被旧失败记录挡住。
- **enqueue 与执行是两个独立运行面**：API 写入 `provider_fetch_jobs` 不会自行执行 provider。Railway 若只跑 `collect.py`，按需队列和 watchlist option scheduler 都会饿死；云端 one-shot cron 必须按顺序运行 scheduler、refresh worker、scanner materialization。当前 cadence 为工作日每 5 分钟。
- **所有 JSONB 写入边界都必须处理 Decimal**：修复 option snapshot 后，scanner materialization 从 PostgreSQL 读回 `gex.raw_metrics` 仍会重新带入 Decimal；若直接 `Json(payload)`，refresh worker 虽已完成，最终 scanner materialization 仍会失败。所有 raw/provider JSON 及其派生 payload 必须使用同一显式 Decimal-to-number encoder，并以完整 refresh cycle 覆盖回归。
- **认证失败的作用域不能扩大为数据不存在**：Railway TT 的 device challenge 只说明该 worker 不能用 TT session；它不能阻断 Mac Studio 或 IB 的后续 quote refresh。on-demand blocker 只可用于 provider 已明确无可用报价的终态，worker-specific auth failure 必须留在队列重试路径。
- **fallback 必须覆盖 provider 初始化失败**：Polygon 缺 key 时错误发生在 `make_provider()`，早于 API 请求或“空报价”判断。若只对空 snapshot fallback，队列会无限重试 Polygon 而永远不尝试 TT/IB。初始化、连接和无 usable quote 三类可恢复失败必须走同一个受限 provider sequence。
- **云端 secret 的验收必须在变量部署后执行**：2026-07-17 Railway option cron 因缺 `POLYGON_API_KEY` 在 provider construction 阶段失败，并误入 TT device challenge。把 secret 加到变量面板不等于运行容器已收到它；必须 deploy 变量变更后再执行 cron，并同时确认 `option_chain_snapshot succeeded`、OI-delta materialization 与 scanner materialization。该次验收写入 2 个真实链快照、4,826 条 OI delta、80 条 scanner rows。
- **端到端验收必须验证用户最终路径**：2026-07-17 RKLB 有 price/IV/GEX 却没有 quoted chain 时，单测与日志分别发现了 scheduler、JSONB Decimal、cross-worker blocker 和 provider-construction fallback 四个断点。最终验收不能止于“worker 成功”：必须确认 Analyze readiness 变为 `option_quotes=true`，再确认 candidate endpoint 能从同一真实 snapshot 返回具体策略腿。

### 14. 状态端点的默认受众是运维，不是产品

- **公开状态端点只应返回产品自己会渲染的字段**：`/api/status/data` 过去返回逐 symbol `source`、`source_counts`、缺失/stale 覆盖明细、`extra_symbols`、job 失败和 provider budget，但前端实际只读 `expected_symbols` 一个字段。多出来的全部是未认证公网可见的采集情报。
- **审计要以消费方为准，不是以字段是否"敏感"为准**：判断哪些字段可以公开，先 grep 前端到底读了什么，再反推最小公开集合；靠逐字段主观判断敏感度会漏掉 `source_counts` 这种间接泄露内部 provider 名的字段。
- **降级必须是单一通道，不能靠调用方自觉**：`toPublicDataStatus()` 是公开视图的唯一出口，admin 与 public 共用同一组 builder。若让两条路径各自拼装 response，新增字段迟早会只加到一侧，公开面会无声扩大。
- **缺失密钥必须关闭端点而不是放行**：`requireAdminToken` 在 `ADMIN_API_TOKEN` 未配置时返回 503。若写成"没配就跳过认证"，一次漏配就等于把运维明细公开，而且不会有任何报错提示。
- **运维读模型与上报写入是不同的信任边界**：`POST /api/heartbeat` 由 collector 用 `HEARTBEAT_TOKEN` 上报，`GET /api/heartbeat/status` 由人读取，应该用 `ADMIN_API_TOKEN`。复用同一个密钥会让采集节点顺带获得读取全局运维状态的权限。

### 15. 门禁必须断言产物，并且必须能失败

- **配置不是产物**：`vite.config.js` 里的 `build.sourcemap=false` 只是意图。真正到用户手上的是 `dist/`。门禁应该扫描 `dist/`，因为任何一次配置回归、插件行为变化或构建路径调整都会让"配置正确"和"产物正确"分叉，而只有后者有意义。
- **没验证过能失败的门禁等于没有门禁**：`check-dist` 和 `scan-secrets` 都先注入伪造 source map、伪造 Polygon key、真实格式的 DB URL 和 Stripe live key 反向验证过。一个永远返回 0 的检查会给出比没有检查更强的虚假安全感。
- **不要把已经发生过泄露的路径排除出扫描范围**：Polygon key 是通过文档进入 Git 历史的。secret 扫描一开始因为文档里的 `postgresql://postgres:PASSWORD@...` 占位符误报，最省事的做法是 `':!*.md'`——那等于把唯一一条已被证实的泄露路径永久设为盲区。正确做法是过滤占位符（`:PASSWORD@`、`YOUR_*`、`${...}`），保留文件在范围内。
- **宁可留下明确前置，也不要猜一个会静默失败的配置**：CSP 若猜错 Clerk 的 host，登录会被静默阻断，且只有浏览器控制台有线索。当前 Clerk 未配置、实例域名无法验证，因此 CSP 只覆盖真实运行的应用，并把"启用 Clerk 前先扩展 CSP"写成 V3A-5 的显式前置。未验证的安全配置不是保守，是把故障推迟到最难排查的时刻。
- **无人读取不是一种保障机制**：审计发现没有任何 provider 名被渲染，但这只是因为恰好没有组件读那些字段——`Scan.jsx` 的 `dataMeta` 把三个原始 provider 字符串送进 props 却无人消费。删掉死字段能减少暴露面，但真正的保障必须是服务端不下发，而不是前端恰好不显示。

### 16. 历史 IV 回填要按“可用 EOD bar”验收

- **分页和月期权回退解决的是代码缺口，不会创造历史行情**：密集 ETF 的 reference contracts 会跨多页；周到期在早期历史日可能尚未挂牌。回填必须同时跟随 `next_url`，优先第三个星期五的月期权，再计算 constant-30-day IV。
- **回填必须增量落库**：把一个 symbol 的数百天结果只在最后一次 commit，会让中断丢失全部进度。每 25 个交易日幂等 upsert 后，可从任何已写日期安全重跑。
- **252 天 readiness 是数据事实**：2026-07-18 的 Phase 2.5 验证使 SPY/QQQ/IWM/GLD/TLT/TSLA/XLC/XHB 达到 252+；XLB/XLE/XLK/XLU/XLY/XSD 的 Polygon EOD option-bar 历史在 2025-12 前不连续，因此继续显示 not-ready，而不是填充或推断缺失 IV。

### 17. IB historical farm 恢复不等于完整 quote entitlement

- **已验证的恢复范围**：2026-07-18 的 bounded SPY diagnostic 成功拿到 delayed last、volume、OI 和 tick 83 model Greeks，证明 Gateway 连通、历史 fallback 与 option 数据回调正常。
- **不能过度解读**：同一请求的 bid/ask 仍为 null，IB `10091/10167` 明确指向 API market-data subscription 限制。必须把它记录为 quote-quality 限制，而不是把 historical farm 恢复误写成“所有期权字段恢复”。
- **产品规则不变**：GEX/结构页面可标注延迟来源；策略候选的可执行价格仍只接受实际 bid/ask，不能用 last 或 model price 代替。

### 18. 有“缺报价检测”不等于会触发报价回退

- **根因（2026-07-19）**：scheduler 的 freshness query 正确地只把有有效 bid/ask 的 snapshot 视为 quote-ready；但它创建的 background job 没有 `request_params.require_quotes`。worker 因此把 quote-less Polygon snapshot 作为成功结果结束，永远不尝试 fallback。
- **修复**：仅在美股常规交易时 scheduler 写入 `require_quotes=true`；worker 将 `polygon_licensed → ib_internal` 作为默认顺序。休市不要求报价，避免把真实但无 bid/ask 的结构快照错误标记为失败。
- **运行证据**：2026-07-19（周末）重载后的 collector 写入了 1,876 条 Polygon option-contract structural rows，bid/ask 为 0；这证明“无报价”是休市状态，不能据此判断 IB 订阅无效。开盘后必须再次验证 IB 真实 bid/ask、Greeks 与 fallback 写入。

### 19. 报价过滤器不能同时兼职"该不该刷新"的判断

- **和第 18 条是同一个查询埋的另一个坑**：`load_refresh_state` 把"最新快照"限定为带有效 bid/ask 的那条，是为了让第 18 条的 quote-readiness 判断正确；但这条查询的返回值同时被拿去做**调度排序**（谁最该被刷新）。一个从未成功拿到报价的标的（含 `VIX` 这种永久失败的——它是指数，走股票 `/prev` 端点必然报错）因此在排序里显示"从未采集"，比任何真实但较旧的快照都排得靠前，每 30 分钟冷却期一到就重新抢占大半队列容量，把 STX/SRVR 等曾经成功、只是较旧的标的饿了 20+ 小时。
- **教训**：同一段 SQL 的返回值如果被两个不同目的复用（"这条快照能不能当报价用" vs "这个标的多久没刷新了"），过滤条件必须按各自目的分别定义，不能图省事共用一个查询——省下的代码量远不够抵消一个隐藏在排序里的资源饥饿 bug。
- **修复**：调度排序改用**任意**快照的时间戳；报价是否达标只在决定"这个 job 要不要求 `require_quotes`"时判断，两件事分离。`VIX` 单独从 `scan_enabled` 移出，不再参与轮转。详见 `docs/validation/SCHEDULER_STARVATION_FIX_2026-07-19.md`。

### 20. "省一次请求"的缓存优化,容忍度过大就是陈旧 bug

- **根因（2026-07-20）**：`SPOT_HINT_MAX_AGE_DAYS=4` 让期权采集器把"最近 4 天内的日线收盘"当现价用（本意是省一次 `/prev` 请求）。结果周四收盘在周一还被当"够新鲜",一个每 5 分钟刷新的产品显示 4 天前、差 $9 的价。**缓存/复用的新鲜度窗口必须按"这个值代表什么"来定**：日线收盘代表的是"某天的收盘",拿它当"现价"最多只有前收盘一天的容忍度,4 天是把语义搞错了。
- **数据源授权要按"实时 vs 延迟"分别实测,不能想当然**：以为 $29 Options 档有 15 分钟延迟盘中价,实测盘中（不只盘前）分钟聚合仍 `NOT_AUTHORIZED`。只有日线和 `/prev` 可用。授权边界必须用真实请求在真实时段验证,写进文档,不能按"一般套餐都有"推测。
- **免费的能力可能藏在 fallback 路径里**：Polygon 拿不到盘中价,但已经在跑的 IB Gateway fallback 盘中给出了真标的价。找"怎么不花钱做到 X"时,先盘一遍现有的每一条数据路径实际能返回什么,再谈买新订阅。
- **一个显示值有多个来源时,标注必须跟着来源走(P3,2026-07-23)**：Analyze 价格头同一个 `result.price` 会在盘中 spot 和日线前收盘之间静默切换,却裸渲染无标注——前收盘看起来和实时价一模一样。修法不是"加个时间戳"那么简单,而是让 price 随身带 `priceAsOf{kind}`,在**赋值处**(种子=收盘、`applyGex` 覆盖=盘中)决定口径,渲染处只翻译。**只在渲染层贴一个笼统时间戳会说谎**:它不知道这个价到底是哪来的。口径要在数据合并的那一步就钉死。
- **时间戳给人看要换算到用户时区,不能裸切 UTC ISO**:站内旧代码惯用 `String(ts).slice(0,16).replace('T',' ')` 直接显示 UTC,对"数据截至"这种辅助信息尚可,但**现价这种要判断新鲜度的值必须换 ET**(`toLocaleString('en-US',{timeZone:'America/New_York'})`),否则"截至 18:32"会让盘中用户以为是晚上、误判过期。
- **单次定时任务 + 采集时点贴着数据 finalize 时刻 = 定期丢最新一条(P4,2026-07-23)**:日线 cron 收盘后 35 分钟就跑,而 Polygon EOD 聚合此刻常没 finalize,于是每次都差最新一根、要等下个工作日才补(周五缺到周一)。教训:①**采集时点要留足 provider 的 finalize 余量**,或干脆一天跑两次(早一次尽早拿、晚一次补 finalize);②**只跑一次的任务没有自愈窗口**——幂等重取虽能自愈,但"下次运行"隔了一个周末就等于三天缺口。③**静默缺口要加可观测守卫**:`settled_market_date` 按 ET settle 小时算"该有哪根 bar",落后就 WARNING(只观测不 fail),把"没人发现直到用户投诉"变成日志里看得见。守卫的时区/settle 阈值要和采集时点对齐,否则早班次会误报当日还没 finalize 的 bar。

### 21. 共享预算行 + upsert 覆盖 + 低默认值 = 双 runtime 定时饿死

- **根因（2026-07-21）**：`reserve_budget` 用 `ON CONFLICT DO UPDATE SET request_budget=EXCLUDED` 让每个跑 worker 的进程都把共享 `provider_request_usage.request_budget` 覆盖成自己 env 的值。`PROVIDER_DAILY_BUDGET` 默认 `1000`；Mac 守护进程 env 是 50000，但 Railway 的 `run_railway_refresh_cycle` import 同一 worker，env 没设时写 1000，把 50000 打回 1000，~1000 请求打满后饿死整个交易时段。
- **教训**：只要多个 runtime 写同一行、且用 upsert 覆盖同一列，那一列的"默认值"就是全系统的下限——任何一个 env 没配好的进程都能把生产拉到默认值。**这种列的代码默认值必须是"安全侧"**（这里 Polygon 无限，安全侧=远高于真实用量），不能是"保守小值"。保守小值配上覆盖语义，等于给每个次要进程一把饿死主进程的钥匙。
- **调查纪律**：用户报"数据旧+OI空"，先用 DB 证伪（OI 其实不空），再按"哪个时段停写"缩小到"盘中全停、盘前正常"，最后守护日志一句 `budget exhausted: remaining_budget=0` 直接坐实。症状（OI空）和根因（预算饥饿）可以完全不相干。

### 22. 物化快照表必须在写它的地方就配 retention，否则默默膨胀到拖慢全库

- **根因（2026-07-21）**：`scanner_results_snapshots`（929MB/53.6万行）、option 链及其 GEX/OI 级联表从上线起一行没删过，每天灌 6-14 万行，整库 2.3GB+。没有任何功能查它们的历史（scan/alerts 只读 `MAX(snapshot_ts)`，weekly/unusual 回看 ≤5 交易日），纯属膨胀。
- **教训**：**"每 N 分钟重算一次的中间产物"从写下的第一天就该带 retention**，保留窗口对齐它的消费回看窗口，不是"以后再说"。区分两类表：累积型事实（IV/价格历史，绝不删）vs 物化快照（用完即弃，只留最新几批）。后者无 retention = 定时炸弹，只是引信长。
- **省事技巧**：优先用 FK `ON DELETE CASCADE`——删一张源表（option_chain_snapshots 7 天）自动连带清 4 张最大的子表（contract 853MB / gex / oi_delta），一个 prune root 覆盖大半膨胀，不用逐表写清理。
- **回收磁盘要 VACUUM FULL**：普通 DELETE + autovacuum 只让空间"可复用"（不再增长），物理磁盘要 `VACUUM FULL`（锁表）才还给云。盘后跑一次：scanner_results 929MB→545MB。
