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
- **拼接的时间序列必须全段同口径,否则相对指标被方法接缝污染(Phase 3,2026-07-23)**:IV Rank 的 252 天序列由历史回填段 + 前向每日段拼接。回填是 constant-30d(call+put、总方差插值),前向曾是浮动 30-45 DTE 单张 **call**——两处差在①浮动 vs 固定到期②call-only vs call+put。拼接点因此有人为跳变,而 IV Rank=`(cur-min)/(max-min)` 对序列里的任何异常极值都敏感,一个方法性跳变就能永久扭曲后续所有读数。实测同日差:TSLA 因旧法丢 put skew 差 **+5.44 vol 点**、SPY/QQQ ~−1.2 点。教训:**任何"历史回填 + 前向采集"拼起来的序列,两段的口径(到期、腿、反解方法)必须逐项对齐**;对齐后仍要留 `iv_source` 三态标记(回填/前向新/前向旧)供序列分析判定方法边界。前向用 Polygon snapshot 自带 IV 即可,不需要像回填那样 BS 反解——但插值到同一 constant maturity 这步必须一致。

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
- GEX 验证路径必须保留 `raw_metrics.unit`、`raw_metrics.formula`、`raw_metrics.positioning_model` 和 `raw_metrics.positioning_assumption`；产品页面只把结果标记为估算，不展示这些实现字段。
- GEX 的持久化与 API 契约仍需保留统一 `gex_metadata`，用于后台验证、版本比较和 replay；产品 display adapter 不保留或渲染模型版本、单位、代理假设、覆盖范围和计算参数。缺少可信结果时前台只显示用户可理解的 unavailable/partial 状态。
- Gamma Flip 重算必须使用 option-chain snapshot 的估值日期，而不是 job 运行当天。否则同一历史链会因剩余 DTE 改变得到不同曲线，不能复现或比较。
- 产品前台只保留结果、用户可理解的数据状态、时间与风险提示。模型口径、覆盖质量、定位代理假设、参数和数据管线属于后台验证信息，不进入产品渲染路径。
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

- **功能页要先统一壳，再允许内容分化**：Scan、Analyze、Market、Earnings 与 Weekly 共享同一个标题字号、起点、弹性宽度和滚动容器；页面特有的数据卡、表格与筛选器不应借由 hero、eyebrow 或页面级 max-width 破坏导航后的视觉连续性。`/market` 单独设 1160px 上限就会显得比其他页面窄；宽度约束应下沉到确实需要控制阅读长度的内部模块。后台 ledger 不属于产品页面。
- **审计完整不等于把实现细节展示给用户**：provider、模型版本、公式、参数、阈值、覆盖率和队列状态应该保留在后端，支持重放、排障和受控审计；产品前台只需要回答“结果是什么、截至何时、现在能不能用、有什么风险”。删除 `DataDetails` 不等于删除 provenance，而是把 provenance 放回正确的权限边界。
- **同一视觉语义层必须共享排版几何**：Analyze 报价头部的 ticker 和价格都属于一级快照事实，就应使用相同字号、line-height 与主/次行结构。仅靠 `align-items:center` 对齐两个高度不同的文本块，会让价格和 ticker 看起来一高一低；先统一块内几何，再做 flex 对齐。
- **验证台账可以耐久，但不必成为产品页**：`candidate_ledger` 记录首见候选和到期结果，属于不可重建的内部验证数据。公开结果不足或用户价值不清晰时，删除 `/ledger` 页面和读取端点仍应保留后台 capture/evaluate；“数据要保留”和“用户要看到”是两项独立决策。

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
- **开机不等于进程恢复**：还需验证 LaunchAgent。2026-07-30 已验证的 `dump.pm2` 含七个 Quantrift collector apps；本次新增 `quantrift-options-quote-worker` 后必须执行 `startOrReload` 与 `pm2 save`，把第八个 app 写入 saved list。只有 `RunAtLoad` 的 `pm2 resurrect` 与最新 saved list 同时成立，机器恢复后采集进程才会自动回来。
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

- **Expected Move 必须在后台保留输入和时间口径**：当前 Scanner 内部使用同一 expiry 的最近 ATM Call/Put IV 均值和 calendar-day `sqrt(T/365)`，并在 estimate object 中保留版本、输入合约和时间；产品 UI 只显示估算结果与“不是价格保证”的风险提示。
- **POP 不是固定策略标签**：只用真实 bid/ask 选腿形成的盈亏平衡点、已声明 IV、利率和到期日计算；缺少任一核心输入就返回 unavailable，而不是沿用 64/66% 之类的占位百分比。
- **跨期结构必须承认模型边界**：Calendar / Diagonal 没有一个单一到期日的静态 payoff，当前单到期 POP 模型不能假装给出精确概率，因此明确标记 unavailable。

## GEX Version Reconciliation Lesson (2026-07-16)

- **原始链存在不等于当前产品 GEX 可用**：GEX 公式/单位版本升级后，旧派生行必须被 API 拒绝，不能静默混用；但拒绝后若没有回填任务，用户会误以为 collector 没有采集。
- **版本迁移应重算派生层，不重拉行情**：collector 现在对最新 watchlist chain 做版本差异检查，并只从 PostgreSQL 重算 GEX/Wall/Flip。这样不会消耗 provider 配额，也不会在模型升级后留下整批“不可用”。
- **用户请求不能排在 watchlist 冷启动之后**：按需 Analyze 任务以显式 priority `100` 入队，worker 优先消费；否则每 5 分钟两个标的的后台补全会把一个具体用户输入拖到数小时。
- **缺 GEX 和缺期权链必须走不同任务**：已有链只做本地 `gex_recompute`，缺链才调用 provider。把两者混为一次 options fetch 会浪费请求，并延长恢复时间。
- **模型边界不能盖过产品解释**：先说“当前是正/负 Gamma 环境”和可能的盘面含义；公开 OI 的估算限制用一句放在后面。把“代理符号假设”放进答案主句，只会让用户读不懂结论。
- **策略候选不可在最后一层被清空**：期权链、报价和 GEX 都 ready 时，前端把 `recommendation` 设成 `null` 会伪装成数据缺失。完整链只应在后端候选引擎读取，Analyze 只消费服务端筛出的策略腿 DTO 和真实的无候选原因。
- **合并远端功能时要检查产品语义冲突，不只看 Git 是否冲突**：2026-07-30 的远端 Analyze 买方/卖方、环境分类和回调支撑代码能被 Git 自动合并，但原始 reason、输入项和赔付参考情景会绕过刚建立的前台保密边界。正确处理是保留后台引擎与测试，在 display adapter 再收敛一次，只让候选、状态和风险进入组件；“自动合并成功”不等于产品约束仍然成立。
- **React 不渲染不等于前台拿不到**：只在 `analyzeRecommendation.js` 丢弃字段，订阅用户仍可从浏览器 Network 或直接调用产品 API 读取完整 `environment`、`structure` 和 payoff basis。真正的产品保护边界必须位于服务端 JSON 序列化之前，并采用 allowlist DTO；新后台字段默认不公开，而不是等 denylist 追赶。
- **期权链完整度与可交易报价是不同条件**：GEX 只需要 Greeks/OI，策略腿还必须有有效 bid/ask。刷新调度若仅检查 `contract_count > 0`，会把无报价快照误判为完成，导致用户永远拿不到具体策略腿。
- **无报价快照必须走定向回退，不是重复同源刷新**：`require_quotes` 的 Polygon job 若没有有效 bid/ask，保留该快照供 GEX/OI 使用，再在同一 job 尝试 IB；所有 provider 仍无报价时以 non-retryable blocker 结束。不能用 mark、last 或收盘价补成假 bid/ask。
- **2026-07-30 架构替代说明**：上一条记录的是 2026-07-19 当时的同步 fallback 修复，现已被独立报价 lane 取代。当前 `option_chain_snapshot` 无论是否有 bid/ask 都以 Polygon 结构链完成 GEX/OI；只有 Analyze 实际需要策略定价时才创建 `option_quote_snapshot`，由独立 IB worker 处理。历史 lesson 保留用于说明为何不能伪造报价，不再描述当前调度行为。
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
- **无人读取不是一种保障机制**：曾经没有组件渲染 provider 名，但 `Scan.jsx` 的 `dataMeta` 仍把三个原始 provider 字符串送进 props。现在 display adapter 已删除这些死字段，并用静态测试阻止 source/provider/model 元数据重新进入产品组件；服务端普通用户响应仍应继续最小化。

### 16. 历史 IV 回填要按“可用 EOD bar”验收

- **分页和月期权回退解决的是代码缺口，不会创造历史行情**：密集 ETF 的 reference contracts 会跨多页；周到期在早期历史日可能尚未挂牌。回填必须同时跟随 `next_url`，优先第三个星期五的月期权，再计算 constant-30-day IV。
- **回填必须增量落库**：把一个 symbol 的数百天结果只在最后一次 commit，会让中断丢失全部进度。每 25 个交易日幂等 upsert 后，可从任何已写日期安全重跑。
- **252 天 readiness 是数据事实**：2026-07-18 的 Phase 2.5 验证使 SPY/QQQ/IWM/GLD/TLT/TSLA/XLC/XHB 达到 252+；XLB/XLE/XLK/XLU/XLY/XSD 的 Polygon EOD option-bar 历史在 2025-12 前不连续，因此继续显示 not-ready，而不是填充或推断缺失 IV。

### 17. IB historical farm 恢复不等于完整 quote entitlement

- **已验证的恢复范围**：2026-07-18 的 bounded SPY diagnostic 成功拿到 delayed last、volume、OI 和 tick 83 model Greeks，证明 Gateway 连通、历史 fallback 与 option 数据回调正常。
- **不能过度解读**：同一请求的 bid/ask 仍为 null，IB `10091/10167` 明确指向 API market-data subscription 限制。必须把它记录为 quote-quality 限制，而不是把 historical farm 恢复误写成“所有期权字段恢复”。
- **产品规则不变**：GEX/结构页面可标注延迟来源；策略候选的可执行价格仍只接受实际 bid/ask，不能用 last 或 model price 代替。

### 18. 有“缺报价检测”不等于会触发报价回退

> 历史记录：本节描述 2026-07-19 的修复。2026-07-30 起同步 fallback 已被独立 `option_quote_snapshot` lane 取代；当前行为以 `docs/ARCHITECTURE.md` 第 45 节为准。

- **根因（2026-07-19）**：scheduler 的 freshness query 正确地只把有有效 bid/ask 的 snapshot 视为 quote-ready；但它创建的 background job 没有 `request_params.require_quotes`。worker 因此把 quote-less Polygon snapshot 作为成功结果结束，永远不尝试 fallback。
- **修复**：仅在美股常规交易时 scheduler 写入 `require_quotes=true`；worker 将 `polygon_licensed → ib_internal` 作为默认顺序。休市不要求报价，避免把真实但无 bid/ask 的结构快照错误标记为失败。
- **运行证据**：2026-07-19（周末）重载后的 collector 写入了 1,876 条 Polygon option-contract structural rows，bid/ask 为 0；这证明“无报价”是休市状态，不能据此判断 IB 订阅无效。开盘后必须再次验证 IB 真实 bid/ask、Greeks 与 fallback 写入。

### 19. 报价过滤器不能同时兼职"该不该刷新"的判断

> 历史记录：本节的调度饥饿根因仍有效，但其中 `require_quotes` 决策已于 2026-07-30 删除。当前 scheduler 只按任意 Polygon positioning snapshot 判断 freshness，报价 readiness 由 Analyze 的独立 quote job 判断。

- **和第 18 条是同一个查询埋的另一个坑**：`load_refresh_state` 把"最新快照"限定为带有效 bid/ask 的那条，是为了让第 18 条的 quote-readiness 判断正确；但这条查询的返回值同时被拿去做**调度排序**（谁最该被刷新）。一个从未成功拿到报价的标的（含 `VIX` 这种永久失败的——它是指数，走股票 `/prev` 端点必然报错）因此在排序里显示"从未采集"，比任何真实但较旧的快照都排得靠前，每 30 分钟冷却期一到就重新抢占大半队列容量，把 STX/SRVR 等曾经成功、只是较旧的标的饿了 20+ 小时。
- **教训**：同一段 SQL 的返回值如果被两个不同目的复用（"这条快照能不能当报价用" vs "这个标的多久没刷新了"），过滤条件必须按各自目的分别定义，不能图省事共用一个查询——省下的代码量远不够抵消一个隐藏在排序里的资源饥饿 bug。
- **修复**：调度排序改用**任意**快照的时间戳；报价是否达标只在决定"这个 job 要不要求 `require_quotes`"时判断，两件事分离。`VIX` 单独从 `scan_enabled` 移出，不再参与轮转。详见 `docs/validation/SCHEDULER_STARVATION_FIX_2026-07-19.md`。

### 20. "省一次请求"的缓存优化,容忍度过大就是陈旧 bug

- **根因（2026-07-20）**：`SPOT_HINT_MAX_AGE_DAYS=4` 让期权采集器把"最近 4 天内的日线收盘"当现价用（本意是省一次 `/prev` 请求）。结果周四收盘在周一还被当"够新鲜",一个每 5 分钟刷新的产品显示 4 天前、差 $9 的价。**缓存/复用的新鲜度窗口必须按"这个值代表什么"来定**：日线收盘代表的是"某天的收盘",拿它当"现价"最多只有前收盘一天的容忍度,4 天是把语义搞错了。
- **数据源授权要按"实时 vs 延迟"分别实测,不能想当然**：以为 $29 Options 档有 15 分钟延迟盘中价,实测盘中（不只盘前）分钟聚合仍 `NOT_AUTHORIZED`。只有日线和 `/prev` 可用。授权边界必须用真实请求在真实时段验证,写进文档,不能按"一般套餐都有"推测。
- **免费的能力可能藏在 fallback 路径里**：Polygon 拿不到盘中价,但已经在跑的 IB Gateway fallback 盘中给出了真标的价。找"怎么不花钱做到 X"时,先盘一遍现有的每一条数据路径实际能返回什么,再谈买新订阅。**P2.1 落地时正是复用了这条**——`IbOptionChainProvider.fetch_underlying` 早已存在(fallback 在用),盘中现价只是把它接进 Polygon 路径,没写一行新 IB 代码。
- **复合快照的 source 要按"主体"定,分量来源记 raw(P2.1)**:一条 `option_chain_snapshots` 期权来自 Polygon、underlying 现价可能来自 IB。snapshot.source 保持 `polygon_licensed`(期权是主体),IB 现价来源记进 `raw_metadata.underlying_source/endpoint/as_of`——既不谎称整条是 IB,也不把 IB 价冒充 Polygon,和 P3 的诚实标注一条线。
- **改关键路径要 flag 默认关 + best-effort 兜底 + 留 live 验收(P2.1)**:盘中 IB 现价接进 option refresh worker(全站最关键路径),但 IB 依赖开盘+连接+授权,闭市写不了验收。做法:`OPTION_IB_INTRADAY_SPOT_ENABLED` 默认 false(翻开即生效、零改动风险)、`fetch_ib_intraday_spot` 任意失败返回 None 绝不炸 Polygon 路径、单测覆盖门控/回退逻辑,**live 验收明确留到开盘**——不因为"想今晚做完"就把无法验证的关键路径改动当完成。
- **聚合指标必须披露样本量,零样本返回 null 不返回 0(R2.2 breadth)**:市场 breadth 按 universe 聚合,但不是每个标的都有每种数据(IV Rank 只有 56/80 只满 252 天)。`pct(count,total)` 在 total=0 时返回 null,每块带 `counted`,前端 view-model 对 `counted=0` 的块塌缩成 null 显"暂不可用"。**假 0% 比缺失更危险**——它看起来像一个真实的极端读数。前后端两层都守这条(后端 `pct()`、前端 `buildBreadthView`)。
- **UI 功能先出渲染 mockup 让用户选,再写代码(R2.2 前端)**:breadth 展示有 2-3 种布局各有取舍,直接写一版容易返工。做法:用产品**真实 tokens + 生产实测数据**做一个 artifact mockup 并排展示方案 A/B,用户一眼选定 B 后再按既定流程实现。省掉"写完发现方向不对"的整轮返工,且实现时 CSS 已经在 mockup 里验证过。
- **计划里的数据源要先验一眼真实分布,别按字段名想当然(R1.3/R1.2,2026-07-23~24)**:R1.3 原计划"按 `symbol_universe.sector` 聚合",实测该字段 **65% 空且完全不含 ETF**(SIC 不分类 ETF)——按它做会残缺误导;改用 **ETF 本身当板块代理**(也正是 RRG 标准做法),更诚实。R1.2 时我又两次口头断言"财报没这数据/ΔOI 多数为 0",实测都错:财报在 `iv_history.earnings_date`、ΔOI 近 2 天 15.8 万行非零。**教训:说"这数据有没有/够不够"之前,先跑一条 count/分布查询**,别凭字段名或一次抽样下结论(抽到 QQQ 的 0 行 ≠ 全表多是 0)。
- **散点图重叠用"主图+联动索引"解,不用 jitter(R1.3 前端)**:RRG 散点 ETF 挤在一起,jitter 会歪曲位置(位置就是信息)。解法(同 StockCharts/Optuma):散点为主(hover 升顶+放大+tooltip)+ 象限列表永远列全(读得清的保底)+ 两边 hover 联动。React 里联动 = 一个 `hovered` state,无需图表库。
- **时间门槛型功能:先建 durable 存储启动积累,别等"有数据了再建"(R2.1,2026-07-24)**:候选结果台账要等候选到期才有结果(最早 08-21,同 IV Rank 252 天)。但 `scanner_candidate_snapshots` 被 prune、候选活不到到期——所以**必须现在就建 durable 表开始捕获入场**,时间才开始为你工作。这类"从空开始、随时间填"的功能,越早建捕获层越好;UI 要诚实显示"积累中 + 最早何时出结果",不装作有数据。
- **单 worker 吞吐调优不等于并发(2026-07-24)**：E7 共享限流器就位后，可以先把 `REFRESH_WORKER_BATCH_SIZE` 从 2 提到 10；实测约 2.83 秒/标的，81 个标的冷启动估算从约 41 分钟降至约 9 分钟。不能据此直接起第二个 worker：全局派生、stale-running recovery 和 queued-job deduplication 仍有单进程假设，必须先拆出单例或加数据库协调。
- **有上限的进程内并行(2026-07-24)**：为覆盖 IB 等待时间，单进程可用 `REFRESH_WORKER_CONCURRENCY=3` 并行执行独立 job；每个线程必须独立 psycopg2 connection/provider，所有 Polygon 请求仍经过 PostgreSQL 全局 limiter。`PendingDerivations` 和 scanner/OI delta materialization 留在主线程。这个方案不等于启动多个 PM2 实例。
- **算不出的结果要标 not_evaluable,不能臆造(R2.1)**:日历/对角多到期结构在近到期日无法用单一收盘价结算(远腿要重定价)。引擎对这类返回 `not_evaluable`、`no_price` 单列披露、不计入胜率,绝不用近似值凑一个"结果"。台账 4,735 候选里 3,495 是 time_spread,如实排除比假装能算更可信。
- **位置指标要配"资金流"才不会被价格骗(R1.3 增强,2026-07-24)**:RRG 只看相对强弱/动量(价格派生),会把"价格领先但资金在撤"的板块画成领先。加一条 MFI 资金流维度后,实测 KIE/XLV 是 A 级(rs 领先)却 MFI 流出——**趋势和资金背离一眼可见**。做法:复用库里现成的 `deriveMfi`(S/R 在用),没重写、没新采集;竞品(nextpick)的 Institutional Net Flow 就是这个,补上后我们的轮动比纯 RRG 多了背离视角。教训:**先翻自己代码有没有现成的纯指标可复用**,再谈新写。
- **一个显示值有多个来源时,标注必须跟着来源走(P3,2026-07-23)**：Analyze 价格头同一个 `result.price` 会在盘中 spot 和日线前收盘之间静默切换,却裸渲染无标注——前收盘看起来和实时价一模一样。修法不是"加个时间戳"那么简单,而是让 price 随身带 `priceAsOf{kind}`,在**赋值处**(种子=收盘、`applyGex` 覆盖=盘中)决定口径,渲染处只翻译。**只在渲染层贴一个笼统时间戳会说谎**:它不知道这个价到底是哪来的。口径要在数据合并的那一步就钉死。
- **时间戳给人看要换算到用户时区,不能裸切 UTC ISO**:站内旧代码惯用 `String(ts).slice(0,16).replace('T',' ')` 直接显示 UTC,对"数据截至"这种辅助信息尚可,但**现价这种要判断新鲜度的值必须换 ET**(`toLocaleString('en-US',{timeZone:'America/New_York'})`),否则"截至 18:32"会让盘中用户以为是晚上、误判过期。
- **背景色写死深色 rgba = 浅色模式必坏(2026-07-24)**:`.tl-zone` 用 `background: rgba(11,13,16,0.45)`(近黑 45% 不透明),深色模式下是"微微下沉的面板",但浅色模式下"近黑叠白"渲染成一坨**浑浊中灰**(用户报"六个灰框视觉非常糟糕")。产品支持 `data-theme` 深/浅切换,**任何面板背景都必须走主题 token**(`var(--bg-input)`/`var(--bg-card)`),写死 rgba 只在深色下看着对。排查同类 bug:grep `rgba(11,13,16` / `rgba(8,11,16` / `background: #0b0d10` 这种硬编码近黑;例外是**盖在深色图片上的 overlay**(如 `.home-live-strip` 盖 hero 图),那种无论主题都该深、可保留。顺带把 chip 从纯背景改成 `bg-card + 1px border`,浅色下才是清爽标签而非糊在一起。
- **单次定时任务 + 采集时点贴着数据 finalize 时刻 = 定期丢最新一条(P4,2026-07-23)**:日线 cron 收盘后 35 分钟就跑,而 Polygon EOD 聚合此刻常没 finalize,于是每次都差最新一根、要等下个工作日才补(周五缺到周一)。教训:①**采集时点要留足 provider 的 finalize 余量**,或干脆一天跑两次(早一次尽早拿、晚一次补 finalize);②**只跑一次的任务没有自愈窗口**——幂等重取虽能自愈,但"下次运行"隔了一个周末就等于三天缺口。③**静默缺口要加可观测守卫**:`settled_market_date` 按 ET settle 小时算"该有哪根 bar",落后就 WARNING(只观测不 fail),把"没人发现直到用户投诉"变成日志里看得见。守卫的时区/settle 阈值要和采集时点对齐,否则早班次会误报当日还没 finalize 的 bar。
- **加新功能前先跑一遍"这套逻辑真的在跑吗"——发现整块方向性打分从写完起就是死代码(2026-07-24)**:要给候选打分加 Gamma 权重,先去看 `candidateEngine.cjs`,发现 `directionalWeight(strategy, environment)` 早就写好了 trend + IV rank 两路加权、还有完整单测,但**生产两个真实调用点(`scan.js`、`materializeScannerCandidates.js`)从没传 `environment` 参数**——函数早退守卫 `if (!environment.trendRegime) return 中性` 让它从上线第一天就静默空转,没人发现因为"不生效"和"没这功能"表现完全一样、且现有单测只测函数本身、从不测调用点有没有真传参数。**教训**:①**给已有加权/开关系统接新维度前,先确认它当前是否真的被调用点触达**,别默认"写了就是生效了";②纯函数单测再全,测不出"调用点忘记传参"这种集成缺口——加一条端到端断言(哪怕只断言"字段确实出现在最终输出里")比堆更多纯函数单测更能防这类死代码;③守卫写"必须有 X 字段才处理"要小心——这会把"X 不存在但 Y 存在"的输入整个短路掉,信号应该独立判断、独立生效。
- **"无配额"≠"无速率限制";旁路脚本会继承不到主路径的所有防护(2026-07-25)**:CLAUDE.md 记着"Polygon 付费档允许无限 API 调用",这话没错但只指**没有月度配额**——**每秒速率限制依然存在**。`backfill_iv_history.py` 是条**旁路**:它不走主采集器那套 `provider_rate_limits`(PostgreSQL 共享限速闸门),`_get` 里既无 pacer 也无 429 处理。串行跑时恰好压在限速线下,所以这个缺口潜伏了很久;一上 6 路并行,20 秒内崩两个 worker。**教训**:①**"能不能并行"要先问"这条路径有没有限速/重试防护"**,别假设它和主路径一样受保护——旁路脚本(回填/一次性迁移/诊断工具)通常是防护最薄的地方;②**429 抛出的位置决定爆炸半径**:这次它从 `underlying_closes`(在逐日 try/except **之外**)抛出,于是整个标的直接挂掉而不是降级一天——**容错的粒度要覆盖到最外层的 IO,不能只包住循环体**;③修复顺序对了才安全——先补重试退避,再并行(3 路稳跑、零崩溃),而不是靠调小并发数去躲。
- **"可疑形态"要逐个诊断,别升级成"一律是 bug"的规则(2026-07-25 回填收尾)**:修完 `occ_ticker` 后我在文档里写下"`days>0 但 computed:0` = bug"。当晚 120 个标的跑完,正好有 6 个是这个形态——**全部不是 bug**:5 个(BATL/LINK/NOEM/MINE/SGP)压根没有期权合约(有股价、无期权链,自然无从反解);`WR` 更微妙,是**ticker 回收**——已到期合约只到 2018 年(属被并购的老 Westar Energy),而现在的 WR 是新上市 ETF、期权只有 2026-08/09 的未来到期,回填窗口正好落在两者空档。**教训**:一个 bug 的"症状形态"不等于"该形态必然是 bug";把一次排查经验固化成判定规则时,要写成**"这个形态需要诊断"**而不是**"这个形态就是 bug"**,否则下次会把正常数据误报成故障。已回改 validation/ARCHITECTURE/task 三处表述。
- **best-effort 吞异常 + "计算 0 条"不报错 = 静默失败(occ_ticker,2026-07-25)**:BRK.B 回填日志显示"275/275 trading days processed"、结果 `computed: 0, written: 0`,**退出码 0、零 WARNING**——看起来像"跑完了",实际每次期权 aggregate 请求都 404。根因:OCC 期权代码的 root 要剥标点(`BRK.B` 的期权是 `O:BRKB...`),`occ_ticker` 却直接拼 `O:BRK.B...`;provider 错误被逐日 best-effort 捕获,于是 275 次失败被压缩成一行无害的汇总。**教训**:①"处理了 N 条"和"成功算出 N 条"是两个数,**日志和验收都要看后者**;②best-effort 逐项容错的批处理,**成功率为 0 应该是一个显式告警**,不能和"成功率 100%"长得一样;③**批量加标的后要抽查真实落库行数**,不能只看脚本退了 0。
- **"替换"式编辑会静默吞掉旧内容,种子文件要按集合核对而不是看行数(2026-07-25)**:用户批量更新 watchlist 时用新列表**覆盖**了文件(205 → 180),看起来"只是加了些标的",实际**静默删掉 135 个**——其中包括**全套 16 个 SPDR 板块 ETF**,而 R1.3 板块轮动的 `SECTOR_ETFS` 是硬编码依赖它们的。用户自己也没察觉(先是坚称"CRCL 明明在文件里",查证后确认确实被覆盖掉了)。**教训**:①**改动种子/配置清单后,要做集合 diff(新增/删除各是什么)而不是只看总数**——205→180 看着像"净减 25",真相是"删 135 加 111";②`comm` 依赖两侧排序规则一致,shell locale 不同会给出错误结果,**用 Python set 比对更可靠**(我第一次就是用 `comm` 得出"AMD 被删"的错误结论,被用户当场纠正);③**下游有硬编码依赖的清单(板块 ETF、基准标的)删除前要检查引用**,否则功能会在没人注意时失去数据源。
- **异步回调 API 测节奏,"什么时候查"和"发没发生"不能混为一谈(R3.2,2026-07-26)**:测 IB 新闻请求节奏,第一版按固定间隔发完立刻查,得出"gap=1秒时 6 个只有 0 个成功"的结论,像是"请求挨太近会被丢弃"。把发送和核对**解耦**(先按间隔发完一批,统一多等一段再查)后,**1/2/3 秒间隔全部 6/6 成功**——上一版的"丢请求"纯粹是往返延迟被误判成了失败。正确姿势是"发请求 → 等它自己的结束回调(带超时)",不是"发请求 → 睡 N 秒 → 查"。**教训**:测异步/回调型 API 的节奏或限流时,**检查时机必须晚于且独立于"最后一次发送"**,否则量的是"我查得够不够晚",不是"系统真实行为"——这条对本项目其它异步 provider(IB 期权、WebSocket 类)同样适用。
- **选数据源前先各打一发真实请求,别按"免费/常识"排优先级(R3.2 新闻,2026-07-26)**:计划里 GDELT 排第一(免费、无需 key),IB 新闻只是"顺带问一句"。live 测完排序反了:GDELT 首次请求就 429,写着"5 秒 1 次",等 20 秒重试**依然 429**(比文档写的还严);而 IB 一测,8 个新闻源全已订阅(含 Dow Jones 全套)、TSLA 近 7 天真拉到 10 条 Barron's/Dow Jones 分析,且**按 conId 精确关联标的**,不用像 GDELT 那样从标题里猜公司名(会把"Block"当普通词误判)。**教训**:①"免费"和"能用"是两件事,只有 live 测过限流和返回质量才知道哪个真能撑起产品;②**标的关联方式本身是选型的一等指标**,不只是"能不能拿到新闻"——GDELT 能拿到新闻,但拿到的新闻对不上标的,等于白拿;③**已有基础设施要优先复用**:项目已经因为 P2.1 依赖 IB Gateway,新闻加进去是"扩展一个已接受的依赖",不是"引入新故障点";两个源都测但选一个用,好过为了"多一条兜底"给较弱的那条重复建一遍关联和去重逻辑。
- **"最近 N 小时"查询结果系统性变旧,先查这个接口是否在读一个没有刷新 SLA 的缓存(R3.2 新闻,2026-07-26)**:`IBNewsProvider.fetch_recent_news()` 用 `reqHistoricalNews` live 实测对 5 个真实标的返回 0 条,48h/96h 窗口都是 0。逐层排查(conId 解析对、事件正常结束、`totalResults=20 vs 300` 结果一致)排除了自己代码的 bug,最后发现:**同一个查询间隔几分钟重跑,"最新一条"的时间戳会变得更旧**(从 07-24 15:30 退回到 07-22 03:05)。查 IB 官方文档确认 `reqHistoricalNews` 的原话是返回"系统里**缓存**的历史新闻列表"——文档里没有任何关于这个缓存刷新频率/一致性的 SLA。这不是数据巧合,是这个接口本身的设计:它查缓存,不保证每次都重新扫描。**改用 IB 另一套完全不同的机制**——`reqMktData`+genericTick `292`(`tickNews` 回调)是**实时推送**,不经过那个缓存;同一批标的实测,新鲜度从"4 天前"变成"49 分钟前"。**教训**:当一个"给我最近 X 小时"的查询接口返回结果系统性偏旧或跑几次不一致时,**先查这个 API 是否有两套机制——一套是缓存/归档查询,一套是实时推送订阅**——而不是先假设自己代码有 bug;判断依据要落在官方文档的措辞上(如"cached"字样),不能只靠猜。
- **Postgres 崩溃恢复后必须先跑 `ANALYZE`,否则优化器在盲飞(2026-07-30 卷满事故)**:数据库扩容重启后服务是通的,但 `/api/scan` 要 **27.3 秒**。原因不是数据量、不是索引、不是查询——是**崩溃把 `pg_stat_user_tables` 的统计信息清零了**(当时每张表 `n_live_tup` 都读出 0,这就是线索),优化器没有基数估计,只能瞎选执行计划。跑一次 `ANALYZE`(10 秒)后同一个接口降到 **1.0 秒,快 27 倍**,没改一行代码。**教训**:任何非正常停机(崩溃、OOM、强制重启)之后,`ANALYZE` 应该是恢复清单里的固定一步,和"确认能连上"同等重要;否则你会以为"服务恢复了但莫名其妙很慢",然后跑去优化根本没问题的查询。
- **别用"平均每行字节数"推断表膨胀,要看 `n_dead_tup`(2026-07-30)**:同一次事故里,我看到 `option_contract_snapshots` 是 1983MB / 140万行 ≈ **每行 1.4KB**,而"这张表应该只有一两百字节",于是下结论"85% 是删除后的死元组,需要 `VACUUM FULL`"。**结论是错的**:实测死元组只占 **4.3%**,autovacuum 一直健康,表就是真的那么大(二十来个 NUMERIC 列 + 索引,而且 `pg_total_relation_size` 本来就含索引)。**教训**:平均行宽区分不了"宽行"和"死行",这两者在字节数上长得一模一样;判断膨胀只有一个可靠依据是 `n_dead_tup` / `n_live_tup`。差点因此对一张健康的 2GB 表做了完全不必要的、会长时间锁表的 `VACUUM FULL`。
- **前端没有请求超时 = 后端一挂就变成永久转圈,而不是报错(2026-07-30)**:数据库宕机时,四个页面全部无限「加载中」,**一个错误提示都没有**。排查发现 `api.js` 的 `getJson` 从来没设过 timeout——后端接了 TCP 但不回话时 fetch 永远 pending,于是每个页面**早就写好的 `.catch(...)` 错误分支根本够不着**。页面不是没做错误处理,是错误永远不会到达。加了 `AbortController` 超时后才恢复正常报错。**教训**:①"有错误处理"和"错误处理会被触发"是两件事,**挂起(hang)和失败(reject)是完全不同的失败模式**,只防后者等于没防;②这次真实的挂起长达 **300 秒**(Railway 网关超时才 502),用户体感就是"网站坏了";③任何 fetch 封装都该有默认 deadline,这属于基础设施而不是可选优化。
- **备份要按"能不能重建"分类,不是全库一把梭(2026-07-30)**:这个库 4.2GB,但**真正不可再生的只有 127MB(3%)**——`candidate_ledger`(模型在某时点推荐了什么,原理上无法重建)、IV/价格历史(能重建但要 15 小时 + API 花费)、新闻/外部流(时点推送,没有历史回补接口)。剩下 97% 是每 5 分钟重新物化、几小时后就作废的快照,备份它们纯属浪费。按这个分类导出后,**压缩完只有 9.4MB**,快到可以每天跑。**教训**:①"要不要备份"的正确提问方式是"丢了能不能重建、重建代价多大",不是"这张表重不重要";②托管平台自带的备份和数据库在同一个账户下,是单点——这次事故证明库真的会死,独立备份不是多余;③**备份必须验证**(核对行数和列结构),脚本退出码为 0 只说明它跑完了,不说明导出的东西能用。
- **修复没有消除症状,就说明你找到的是放大器不是根因(2026-08-03 价格停更)**:价格采集每个标的要 10 分钟,查到限速器有个真 bug——300 秒等待上限是**认领槽位之后由调用方施加**的,于是"睡 300 秒然后照发不误",正好绕过刚拿到的 429 退避,再被罚、再绕过,槽位一路涨到 1076 秒。这个诊断可复现、代码确实错、修了也确实对。**但修完之后症状一点没变。** 继续查才发现真凶:crontab 里写着 `* * * * 1-5 run_refresh_worker.py`,**每分钟启一个 worker,而每个要跑几分钟到几十分钟**,启动比结束快就无限堆积——实测堆了 **30 个进程**、跨度 2.5 小时。30 个进程同时认领槽位,推进速度是时间流逝的 30 倍。限速器那个 bug 是**放大器**,不是源头;当初那场 429 风暴的真凶也是这 30 个进程。**教训**:①"诊断站得住"和"诊断是根因"是两件事,**验收标准必须是"症状消失",不是"我找到了一个真 bug"**;②这类"每分钟启动一个长任务"的 cron 是经典反模式,而且它和 PM2 里的 `quantrift-options-collector` 频率完全一样、做的是同一件事——**两套调度器跑同一份工作**,项目文档里明写的"单写者"原则被违反了很久没人发现;③排查时**从数据侧反查(哪张表事实上停更了)** 是代码审查看不到的维度,这次就是它先暴露出问题。
- **省 API 调用的跳过逻辑,会顺手砍掉搭同一趟车的数据(2026-08-03)**:`collect.py` 里有个"IV Rank 能自己算了就跳过 Tastytrade"的过滤器,省调用没错。但那次调用**同时还带回 `earnings_date` 和 `term_structure`,而这两个字段没有任何替代来源**。跳过之后它们就永久冻结了——实测 **207 个标的的财报日期停更**,且每有一个标的攒够 252 天变"就绪",就多一个停更,**会持续恶化**。更糟的是同一个 gate 在 `run_symbol_metrics_snapshot` 里还有一份(我第一次只修了 cron 那条路,漏了按需刷新那条),而且那边跳过时返回的 summary 不含 `market_date`,导致 `symbol_data_state` 把冻结的数据标成 `refresh_status='ok'`——**假绿,比静默失败更危险**。**教训**:①判断"要不要跳过一次调用"时,必须列全这次调用产出的**所有**字段,逐个问"它有别的来源吗",而不是只看触发跳过的那一个;②正确的形态是**就绪只降低频率、不停止采集**;③修完一处要全仓搜同款 gate,同一个错误模式往往在 cron 和按需两条路上各有一份。
- **市场结构的软倾向,不要冒充硬冲突(2026-07-24)**:Gamma regime 对策略是"利于/不利于"的软提示(正 Gamma 环境不代表 Long Straddle 一定错),和"策略方向与当前趋势相反"这种硬冲突性质不同——后者该标 `conflict:true` 走警告样式,前者只应该是独立的 `gammaNote` 信息条(蓝色,非黄色警告)。把两种语义混进同一个 `conflict`/`note` 字段,会让用户把"温和的市场结构提示"误读成"这个候选有问题"。
- **优先级不能隔离阻塞 IO；要隔离 job type、claim query 和进程(2026-07-30)**:把 IB fallback 的 priority 调低，仍然解决不了它占住 3 个主 worker 槽位的问题；`ThreadPoolExecutor` 已经领取 job 后，后面再来的高优先级 Polygon 任务只能等。真正的隔离要同时满足三层：①`option_chain_snapshot` 与 `option_quote_snapshot` 是不同 job type；②主 worker SQL 明确 `job_type <> option_quote_snapshot`，quote worker SQL 明确只等于它；③IB 在独立 PM2 进程中单路消费。这样 timeout 只拖慢用户请求的那一个报价 lane，不能拖慢全市场 GEX。仅拆函数、仅加 async、仅改 priority 都不够。
- **高密度表格的“紧凑”不等于截断；原子事实应 soft-indent 换行(2026-07-30)**:Scanner 为压缩宽度把 positioning/candidate 文本做 ellipsis，结果标题和关键腿信息被截掉；又把整段 `A · B · C` 塞进一行，Debit 因两个 summary 拼接重复出现。正确做法是数据层先把分隔符拆成原子 facts、去掉重复口径，再让每个 fact 独立一行并用小圆点 soft-indent；CSS 允许 wrap/overflow-wrap，禁止 truncate。需要绑定理解的两项留同行(到期日+DTE、OI+spread、Gamma sign+net GEX)，其余逐行。UI 不应默认打印“快照延迟”“社区样本”这类内部诊断词。
- **主题优化必须同时提高两套主题的层级差，而不是只换色值(2026-07-30)**:浅色“不醒目”的根因不是单个蓝色不够深，而是页面背景、card、nested surface、border、muted text 的明度差过小；深色“不一目了然”也同样是层级不足。最终把 `bg/surface/surface-muted/input`、`border/light/strong`、`text/dim/muted` 设成语义梯度，并让 section header、metric accent、active state、focus ring 统一消费 token。验收必须逐页切换深/浅两套主题；只看一套会把另一套的硬编码颜色问题带回去。

### 21. 共享预算行 + upsert 覆盖 + 低默认值 = 双 runtime 定时饿死

- **根因（2026-07-21）**：`reserve_budget` 用 `ON CONFLICT DO UPDATE SET request_budget=EXCLUDED` 让每个跑 worker 的进程都把共享 `provider_request_usage.request_budget` 覆盖成自己 env 的值。`PROVIDER_DAILY_BUDGET` 默认 `1000`；Mac 守护进程 env 是 50000，但 Railway 的 `run_railway_refresh_cycle` import 同一 worker，env 没设时写 1000，把 50000 打回 1000，~1000 请求打满后饿死整个交易时段。
- **教训**：只要多个 runtime 写同一行、且用 upsert 覆盖同一列，那一列的"默认值"就是全系统的下限——任何一个 env 没配好的进程都能把生产拉到默认值。**这种列的代码默认值必须是"安全侧"**（这里 Polygon 无限，安全侧=远高于真实用量），不能是"保守小值"。保守小值配上覆盖语义，等于给每个次要进程一把饿死主进程的钥匙。
- **调查纪律**：用户报"数据旧+OI空"，先用 DB 证伪（OI 其实不空），再按"哪个时段停写"缩小到"盘中全停、盘前正常"，最后守护日志一句 `budget exhausted: remaining_budget=0` 直接坐实。症状（OI空）和根因（预算饥饿）可以完全不相干。

### 22. 物化快照表必须在写它的地方就配 retention，否则默默膨胀到拖慢全库

- **根因（2026-07-21）**：`scanner_results_snapshots`（929MB/53.6万行）、option 链及其 GEX/OI 级联表从上线起一行没删过，每天灌 6-14 万行，整库 2.3GB+。没有任何功能查它们的历史（scan/alerts 只读 `MAX(snapshot_ts)`，weekly/unusual 回看 ≤5 交易日），纯属膨胀。
- **教训**：**"每 N 分钟重算一次的中间产物"从写下的第一天就该带 retention**，保留窗口对齐它的消费回看窗口，不是"以后再说"。区分两类表：累积型事实（IV/价格历史，绝不删）vs 物化快照（用完即弃，只留最新几批）。后者无 retention = 定时炸弹，只是引信长。
- **省事技巧**：优先用 FK `ON DELETE CASCADE`——删一张源表（option_chain_snapshots 7 天）自动连带清 4 张最大的子表（contract 853MB / gex / oi_delta），一个 prune root 覆盖大半膨胀，不用逐表写清理。
- **⚠️ 但这条"省事技巧"有反面，2026-08-09 被咬到**：CASCADE 是按**存储血缘**删的，不是按**信息价值**删的。`gex_snapshots` 挂在链上，于是跟着链一起 7 天清零——可它不是"重算即得"的中间产物，而是**对过去某一刻做市商持仓的一次性观测**，链没了就永远算不回来。等到想验证任何 Gamma 假设时，手上只有 7 天数据，而时间是唯一买不到的输入。
  - **判据**：挂 CASCADE 前对每张子表问一句——「删掉之后还能重算出来吗？」能（contract 快照、oi_delta 可由链重推）→ 挂；不能（对某时刻状态的观测）→ **不要挂外键**，另建 durable 表。
  - 这跟第 21 条（`candidate_ledger` 必须独立于被 prune 的 `scanner_candidate_snapshots`）是**同一个教训的第二次出现**——第一次是候选台账，第二次是 GEX 历史。凡是「现在不存，将来无法回补」的东西，都不能寄生在会被清理的表上。
  - 代价小得离谱，不值得省：实测标量只占 GEX 行体积的 3%（269 kB vs 两个 JSONB 8,290 kB），全量盘中保留约 30 MB/年。**当初顺手加一张无外键的表，就不会丢掉这几个月。**
- **回收磁盘要 VACUUM FULL**：普通 DELETE + autovacuum 只让空间"可复用"（不再增长），物理磁盘要 `VACUUM FULL`（锁表）才还给云。盘后跑一次：scanner_results 929MB→545MB。

### 22b. 外置卷（exFAT）会静默吃掉你的清理逻辑

- **现象（2026-08-09）**：`FACT_BACKUP_KEEP=14` 形同虚设，备份目录堆到 17 份、最早可追到两周前，且**没有任何报错**——因为清理被包在 best-effort 里。
- **根因**：macOS 在 exFAT 上给每个文件配一个 AppleDouble sidecar `._name`。`iterdir()` 把它列进待删列表，但删除 `name` 时系统已连带删掉 `._name`，轮到该条目就 `FileNotFoundError`，异常发生在循环中间 → 该目录的 `rmdir` 永远不执行。
- **教训**：**文件遍历删除一律 `unlink(missing_ok=True)`**——删除过程本身会改变目录内容，"先列表、后逐个删"这个模式天然存在 TOCTOU 缺口，跨文件系统时尤其明显。另外，把 best-effort 兜底和"静默失败"分开看：兜底是为了不中断主流程，不是为了让失败无人知晓，清理类逻辑至少要能在日志里数出「本轮删了几个」。
# 财报日历的数据边界

## 全市场 Breadth 的上线纪律（2026-07-30）

- **“收盘了”不等于数据已经可用**：全市场指标还需要已迁移的持久化表、具备 Grouped Daily 与 point-in-time reference 权限的 Polygon key、一次通过样本/覆盖率门槛的真实采集，以及 API/UI 验收。缺其中任何一项，都只能是 unavailable/missing，不能把 scan universe 填进去，也不能把配置错误描述成“等待收盘”。
- **migration 成功不等于首个快照成功**：本次 Railway `market_breadth_daily` 表创建成功，但 collector 在出网前因没有 `POLYGON_API_KEY` 停止。运行记录必须分开写“schema 已就绪”和“数据已写入”，并只在后者通过 `counted >= 2000`、`coverage_pct >= 90` 后启用定时任务。

财报日期与“未来 7 天”的市场简报不同：日历按纽约时区自然周（周一到周五）查询，空周也应返回完整周边界以便前端显示空列。`earnings_date` 仅是日期，不能由此猜测报前、盘后或盘中时段。

## Refactor 要按运行时边界拆，不按“common”一锅端（2026-07-30）

- 一个 920 行 route 同时放 SQL、HTTP 和纯算法，会迫使单测通过 route 间接加载 DB。纯 Market 算法移入 `domain/market` 后，route 降为 orchestration，测试可以直接钉住领域行为。
- Polygon 的重复不只是样板：Option Chain 主分页曾绕过其他 provider 已有的共享 pacer/429 backoff。基础设施重复会形成可靠性差异，所以 HTTP transport 必须集中；endpoint 参数和 payload parsing 则不能泛化掉。
- 前端统一 HTTP 层的价值不是少几行 `fetch`，而是让 GET/POST/DELETE 都拥有相同的 timeout、auth 和可检查的 `ApiError.status`。产品 endpoint 函数仍应保留，避免组件拼 URL。
- 前端、Node server、Python collector 是三个独立运行时。不要为了消除几段相似文案建立跨运行时 common package；保持 API contract 稳定，分别重构和验证。
- ticker regex 看起来相同也不能直接替换成一个常量：Analyze 保留“必须字母开头、最多 10 位”，Technical Levels 保留“必须字母开头、最多 12 位”，其余 route 保留旧的 12 位字符集。共享 helper 应把差异做成显式参数。
- 前端 async 抽取只适合稳定 loader 的简单只读请求。带 week、symbol、轮询、重试或多请求合并的 effect 继续留在页面内，避免为了复用制造 stale closure 或隐藏业务状态机。
- 测试 helper 也要纳入重复扫描，但只合并真实相同的协议。普通 JSON response recorder 可以共享，security-header recorder 有 `setHeader/removeHeader` 的不同 contract，必须独立。
- SQL 重复应只抽稳定的事实边界，不拼成万能 query builder。Scan 与 candidate materializer 对 quoted chain 的可执行性判定和 contract JSON projection 完全相同，适合共享 CTE；各自的 batch、filter、排序 SQL 仍留在所属模块。

## 隔离重构会静默移除它顺带承担的职责（2026-08-09）

- 2026-07-30 让后台 positioning lane 变成 Polygon-only 是**对的**：一次 IB 超时不该占住 GEX worker 槽位。但那条 fallback 同时是**唯一规模化产出可成交报价的机制**，隔离把它一起移除了，quoted symbol 从 55 掉到 1，而这个副作用当时没有被记录。**拆掉一条路径之前，先问它除了你要隔离的那件事之外还在承担什么。**
- 坍塌之所以三周无人察觉，是因为**每一层都在正常工作**：Polygon 快照 `provider_status='ok'`、GEX 正常、scanner rows 正常、候选批次 `status='completed'`。只有"覆盖了几个标的"这个数字会暴露问题，而没有任何地方在看它。**管线健康 ≠ 管线有用**；成功状态要配一个覆盖率指标，否则一个只处理 1/327 输入的系统看起来和满负荷运行一模一样。
- `quantrift-options-quote-worker` 在线、0 重启、日志 101,264 行 `No queued refresh jobs in quotes lane`。**一个空转的 worker 在监控上和一个繁忙的 worker 没有区别**——两者都是 online。空队列必须是可告警的状态，不是沉默。

## 派生值与原始行情是两个商品（2026-08-09）

- Polygon 期权档给 delta/gamma/theta/vega、IV、OI、当日 OHLCV，**不给 bid/ask**。这些 greeks 正是他们从自己持有的 NBBO 反解出来的——低档卖计算结果，高档卖原始输入。**"有 IV 和希腊字母"不蕴含"有报价"**，评估 provider 时必须逐字段核对而不是看功能清单。
- `last`/`day.close` 覆盖率 87.8%，很诱人，但**成交价不是可成交价**：没有价差就无法评估执行成本，`maxSpreadPct` 硬过滤与 `spreadFit`（100 分占 20）同时失效，而 `pricing_input: 'executable_bid_ask'` 会变成假陈述。样本里 `volume=2, OI=1, close==previous_close` 的合约说明了为什么——那个价格没动是因为根本没人交易。
- 早有同一边界的记录（`polygon_option_chain_provider.py:47` 注明盘中 spot 因 `NOT_AUTHORIZED` 默认关闭），但没人把它推广到"报价大概也在墙外"。**一次 entitlement 拒绝应当触发对同档其余端点的系统性排查，而不是只关掉那一个开关。**

## 过时的验证记录比没有记录更危险（2026-08-09）

- `IB_RAW_TICK_DIAGNOSTIC_2026-07-18.md` 断言 IB 的 bid/ask 被权限阻断。那是 `IB_MARKET_DATA_TYPE=3`（延迟）下的结论；PM2 改成 `=1`（live）后 IB 实际给出 44/44 可成交报价，但没人回来更新。**三周里，写下来的记录说这条路不通，而生产早已在走它。** 一个据此排除 IB 的人会做出错误决策。
- 修正的方式是给原记录加「SUPERSEDED IN PART」章节并指向新记录，不是删掉重写：**旧结论在它自己的条件下是对的**，要保留的是"结论的适用范围"，被推翻的只是那次过度泛化。
- 教训：**validation 记录必须写清测试时的运行时配置**（这里是 market data type）。缺了它，结论就无法判断还适不适用，只能整条作废或被误用。

## 样本量与独立性（2026-08-09）

- 候选台账 15 笔已评分，按族看 credit_vertical 3-0、iron 3-0、single_leg 0-7、straddle_strangle 0-2，干净得像在说"卖方有效买方无效"。但**15 笔全部为同一天建仓**——同一次市场波动，统计上更接近 n=1。**看起来在说话的分割，往往只是在描述一个交易日。**
- 赢均 +0.250 RoR、输均 −0.860 RoR：这是高 POP 结构的典型形态，也正是 POP 不得被呈现为期望值的原因。`payoffForCandidate` 的文件头早已论证过——在产生 POP 的同一个风险中性测度下，任何公平定价期权的期望值按构造约等于 0。**胜率高不等于赚钱。**
- 更根本的一条：**能回答"这套打分是否有效"的唯一仪器是台账，而它的样本受限于候选流量而非台账本身。** 在流量恢复之前增加功能，等于在一个测不出差异的系统上做优化。先恢复流量，再让台账决定哪些功能配得上被建。

## 沉默的日志比吵闹的日志危险（2026-08-09）

- `quantrift-news-error.log` 十天长到 **683 MB / 533 万行**无人察觉，因为它藏在名为 `*-error.log` 的文件里——**没人会去读一个"错误日志"来找正常输出**。里面 99.9% 是 `ibapi` 按 INFO 打的协议帧（`REQUEST reqMktData`、`SENDING cancelMktData` 各约 5 万条），真错误被彻底埋掉。**噪音写进 error 流不只是浪费空间，它让这个文件失去了它名字承诺的用途。**
- 修法早就存在于同一仓库：`run_quote_worker_daemon.py` 里有一模一样的 `ibapi` 静音,只是 news 这条线被漏掉。**当一个第三方库需要静音时,那是全局属性,不是某条管线的属性**——应该在引入该库的地方统一处理,而不是等每条线各自踩一遍。
- 只设大小上限**不能**解决这个问题:它会把 683 MB 安静地截断,沉默照旧。所以轮转必须同时**监控增长速率**——把"悄悄长到 683 MB"变成一个能被发现的事件。日采样太粗,要按小时。

## 删除之前，校验和是唯一可接受的证据（2026-08-09）

- 归档 22 个 PM2 日志后按文件大小比对，8 个偏短 52 字节到 3.9 KB——**因为我是在进程还在写的时候复制的**。源停写后重新同步才一致。任何"复制正在被写入的文件"的操作都必然产生这种偏差。
- 更危险的是**只比大小会漏掉内容不同**。备份目录里 `20260730T215404Z` 两边同名，外置盘只有 4 个文件、缺 5 个（含 23,430 行的 `candidate_ledger.csv.gz` 和 `manifest.json`），而**已有的 4 个字节级完全一致**——这说明是一次被中断的复制,不是版本差异。**按目录名或目录数判断"已备份"会直接丢数据。**
- 因此顺序必须是:停写 → 复制 → **逐文件校验和** → 才能删源。中间任何一步省掉,都会在"看起来已备份"的状态下丢东西。

## PM2 的配置读取与实际生效是两回事（2026-08-09）

- 改完 `out_file`/`error_file` 后 `pm2 reload`，`pm2 jlist` 里 `out_file` 已是新值，**但 `pm_err_log_path` 仍是旧路径**——那才是 PM2 实际写入的字段。实测旧文件在 reload 一分钟后还在被追加。**路径在进程创建时解析，reload 只更新 env。** 必须 `delete` + `start`。
- 教训一般化:**"配置已被读取"不等于"配置已生效"**。验证要看运行时实际使用的字段或直接观察行为（文件是否还在增长），不能看配置对象。
- `delete` 的爆炸半径要先划清楚:这台机器上 30 个 PM2 app 里只有 11 个属于本仓库,其余 19 个属于别的项目。**按名字精确删除,删完立刻验证其余 app 状态正常。**

## 外置卷的静默失败模式（2026-08-09）

- 卷未挂载时,macOS 会把 `/Volumes/X9_Pro` 当作**启动盘上的普通目录**创建,写入静默落到内置盘;卷重新挂载后该目录被遮蔽,数据看起来凭空消失。所以任何写外置路径的代码**必须在目录不存在时报告并退出,绝不 mkdir**——"帮忙创建"正是让数据丢失的那一步。
- 同一个卷刚挂载时**目录列表可能不完整**:实测 `ls -la` 对一个有内容的目录返回空,据此建了一批重复且命名不一致的文件夹。exFAT 卷尤其如此。**判断"目录是空的"要用 `find` 复核,别信单次 `ls`。**

## 「零使用」的索引要问为什么，不能只看计数（2026-08-09）

- `option_oi_delta_snapshots_symbol_unusual` 103 MB、`idx_scan = 0`。光凭计数只能说"目前没人用",删起来心里没底。真正的证据在**列顺序**:索引是 `(symbol, is_unusual, snapshot_ts DESC)`,而查询是 `WHERE symbol = $1 AND snapshot_ts = (...)`,`is_unusual` 只在 ORDER BY 里——**它夹在两个谓词列中间,挡住了 `snapshot_ts` 的等值条件**。所以这不是"暂时没用上",是这个查询形状**永远用不到它**。同表 `_symbol_ts (symbol, snapshot_ts DESC)` 精确匹配,拿走了全部 577k 次扫描。
- 找到机制之后,删除从"赌一把"变成"确定的事",而且顺带知道了**重建也没用**——想帮 ORDER BY 得建 `(symbol, snapshot_ts DESC, is_unusual DESC)`,但单个 `(symbol, snapshot_ts)` 的行数少到内存排序就够。
- 删索引前还要看两样计数看不到的东西:**有没有外键指向它**,以及 **`relreplident`**。主键若是 replica identity(默认就是),删掉会让逻辑复制的 UPDATE/DELETE 失效——即使当前没有 publication,那也是把未来的选项一起删了。

## 空目录会伪装成有效数据（2026-08-09）

- `KEEP=14` 的备份保留下,实际只有 13 份真数据:一个在 `psycopg2.connect()` 处被中断的运行留下了空目录,而 `prune_old_runs` **数目录不看内容**,于是空壳占着名额把一份真备份挤了出去。**任何按数量保留的策略,都要先定义"什么算一份"。**
- 根因在顺序:**运行目录建在连数据库之前**。mkdir 到第一次成功写入之间的任何失败都会留下空壳。资源创建应尽量推迟到"确定会用到它"之后——这里就是连接成功之后。
- exFAT 上还有第二层伪装:macOS 给每个文件配一个 `._name` 影子。真文件被删、影子留下的目录,用 `ls` 或计数看都像有内容。**判断"有没有数据"必须显式排除 `._` 前缀。**

## 惰性迭代器 + 边遍历边删除（2026-08-09）

- `for child in stale.iterdir(): child.unlink(missing_ok=True)` 看着很安全,`missing_ok` 也确实处理了"删不存在的文件"。但 `iterdir()` 是**对活动目录的惰性生成器**:删掉 `a.gz` 会连带移除 `._a.gz`,生成器推进到那一项时它已经不在了,于是在**迭代**处抛错,而不是在 unlink 处——`missing_ok` 根本管不到。结果是 `rmdir` 没执行,留下被剥了一半的目录。
- 我在 APFS 上没能复现,只在 exFAT 上发生。**"本地测不出来"不等于"不存在"**,文件系统语义差异是真实的。
- 正确做法不是加 try 或先 `list()`,是**用 `shutil.rmtree`**——它本来就是为"递归删除且容忍并发变化"设计的。遇到这类问题先问标准库有没有现成的,通常比自己修补循环可靠。

## 一个模型的符号约定可能对某个用途恰好是反的（2026-08-11）

- `compute_gex` 用 "call 正 / put 负"（`call_gex=+γ·OI`、`put_gex=−γ·OI`）。这个约定本身没错，
  它服务的是"整体做市商 gamma 是稳定还是放大"这个问题。但它**隐含假设做市商持有多头 call**。
- 散户型 gamma squeeze 恰恰相反：散户狂买 call、做市商被迫做空 call。
  **同一份持仓，在这个约定下算出的符号是反的。** 拿 `gamma_regime` 当挤压筛选的判据，
  会稳定地选出错误的标的——而且因为每个数字看起来都正常，很难发现。
- **教训**：复用一个既有派生字段之前，先问「它当初是为回答哪个问题而定义的，
  和我现在要回答的是不是同一个」。字段名对得上不代表语义对得上。
- 处理方式不是去改 `compute_gex`（那会破坏它原本正确的用途），而是**在新用途里
  只用不依赖该假设的可观测量**，把有争议的字段降级为上下文并写测试锁定它不参与过滤。

## 筛选结果被 ETF 占满，通常是判据缺了一个类型维度（2026-08-11）

- 挤压榜第一版前二十全是宽基 ETF（DGRO/VWO/XLF/IWM）。ETF **结构上不会被挤压**：
  创设赎回让供给弹性，没有流通盘约束，做市商还有合法裸卖空豁免——
  这也是为什么 ETF 的 SI% 常年超过 100%（实测 XBI 114%、KBE 66%）却毫无意义。
- 同一个坑在轧空调研（2026-08-09）里已经记过一次，这是第二次踩。
  **凡是"哪些标的浮上来"的筛选，都要先问该判据对 ETF 是否成立。**
- 同版还犯了第二个错：按 call/put OI **比率**排序，而薄链的分母接近零，
  于是榜首是除法假象。**比率排序必须给分母加绝对下限**，否则排的是数据稀疏度不是信号强度。

## 分页 API 不加日期下界，取回来的可能正好是反的那一半（2026-08-11）

- Polygon 的 short-interest 端点默认返回 **2017 年起的全历史**，且按 ticker 排序。
  带上限的游标翻页（10 页 × 5 万）取回 50 万行，覆盖的却是**字母序前 47 个 ticker 的完整历史**，
  而不是全市场的最新快照——正好是想要的反面。
- 该端点**忽略 `sort` / `order` 参数**，日期过滤是唯一有效的杠杆。加上 `settlement_date.gte`
  之后，命中数从 32 升到 181（全部目标行）。
- **教训**：对"全市场 × 全历史"型端点，先明确自己要的是**横截面**还是**时间序列**，
  再决定用什么维度收窄。默认顺序几乎从不是你要的那个维度，而行数看起来很多会掩盖这一点——
  50 万行听着像抓全了。

## 用白名单过滤"无害错误码",迟早会丢掉好数据（2026-08-13）

- IB 的 `error()` 回调同时承载**错误**和**通知**。我按白名单枚举无害码，
  结果 **2176**（`Warning: API version does not support fractional share size rules.
  Trimmed value 5349354.640999 to 5349354`）不在名单里，被当成致命错误——
  首次全量运行 12/12 全部标记为 error，**而数值其实已经在手**。
- 两处教训：
  1. **能按区间判定就别枚举**。IB 保留 2100–2199 给警告，判区间不会被陌生码打穿；
     白名单的失败模式是"遇到没见过的就当最坏情况"，正好和你想要的相反。
  2. **有数据优先于有错误**。同一请求可以既返回通知又返回可用数据，
     "收到错误就丢弃整次结果"会损失真实观测。判定顺序应该是先看有没有数据。
- 救了这次的是那句 `by_status` 全 error 时的告警日志——**把"安静的零"变成显式警告**，
  否则 12 行 error 入库、看起来像"今天就是没数据"。

## 注释里的反引号会终止 JS 模板字符串（2026-08-13）

- 往 `migrate.js` 的大段 SQL 模板字符串里加注释时，写了反引号包裹的字段名，
  整个模板字符串在那里被提前终止，报错却指向 900 行之外的 `pool.query(` 开头，
  与真正的出错位置完全无关。
- **在 JS 模板字符串内的任何文本（包括 SQL 注释）都不要用反引号**，
  `$` 加花括号同理。定位这类错误要找的是分隔符，不是报错行号。

## 超时不等于被封：先逐端口探测，再下"网络阻断"的结论（2026-08-13）

- IBKR 的借券费率文件在 `ftp3.interactivebrokers.com`，curl 和 ftplib 都超时。
  我据此判定"本网络阻断出站 FTP"，把免费的费率数据列为"需换网络重试"，
  并已经开始考虑 Ortex/S3 的四位数年费。
- **判断是错的。** 逐端口探测发现 `ftp2:21` **可连**，只有 ftp3 不通——
  它已停止服务，而且是**超时而非拒绝连接**，症状和防火墙完全一致。
  换 ftp2 后一次成功，费率零成本到手。
- **教训**：`connect timeout` 有两种成因——中间设备丢包，或对端已死。
  两者症状相同、结论相反。**下"被封"的结论之前，先测同一供应商的另一个主机/端口**：
  一个能通、一个不通，说明问题在对端而不在你这边。这次的成本差是 0 vs 每年四位数。
- 附带教训:所有公开资料(包括 IBKR 自己的旧文档)都指向那台已停用的主机。
  **文档写的地址不通时，先怀疑地址过期，而不是先怀疑自己的网络。**

## 派生字段会悄悄编码采集限制，用它排序就是在给自己的窗口排序（2026-08-13）

- `total_oi` 看起来是"期权总持仓"，实际是"我们存下来的那 120 个合约里的 OI"——
  被 `OPTION_MAX_CONTRACTS` 和 `OPTION_MAX_STRIKES_PER_SIDE` 限制在现价 ±5% 左右。
- 致命的地方不是它偏小，而是**偏得有系统性**：高价股行权价间距大、OI 落在窗口外，
  低价密集行权价的标的全在窗口内。所以按它排序等于按"行权价密度"排序，
  结果 META（真实 OI 是测得值的 20 倍）、AMD、TSLA 被挤出前 50，
  让位给成交额只有它们十分之一的标的。**每个数字看起来都正常，排序结果整体是错的。**
- **教训**：拿一个派生字段当排序键之前，先问「它是被什么口径算出来的，那个口径有没有上限」。
  优先选**上游最原始、最不可能被自己的管线污染**的量——这里是标的成交额（来自价格数据，
  任何期权侧的存储上限都碰不到它）。
- 这和第 22 条（CASCADE 按存储血缘删除而非信息价值）是同一类错误的两种形态：
  **把实现细节当成了业务事实**。

## `Number(null)` 是 0：缺失值会伪装成一个看起来完全合法的数（2026-08-13）

- 给台账加多到期日结算时，远腿要按当天实测 mark 平仓。第一版的取值与校验是：
  `const mark = Number(marks?.[key]); if (!Number.isFinite(mark) || mark < 0) return no_price;`
- `Number(null)` 是 **0**，有限、非负，两道闸门都过。于是**「没取到报价」被结算成
  「这条腿一文不值」**。远腿是 diagonal 的多头腿，后果是把每一笔未取到价的 diagonal
  系统性地报成亏损——而这套设计的全部目的，就是防止用编造的价格结算。
  **防线自己成了那个编造价格的地方。**
- `Number('')` 和 `Number(false)` 同样是 0，`Number([])` 也是。JS 里"空"到"数"的转换
  几乎全部落在 0 上，而 0 在金融语境里恰好是一个有意义的价格。
- **教训**：**空值检查必须在 `Number()` 之前**，用 `=== null / === undefined / === ''` 显式拦，
  不能指望 `Number.isFinite` 帮你挡住——它挡的是 `NaN`，不是"缺失"。
  凡是"缺失"与"零"在业务上含义相反的字段（价格、余额、持仓、费率），这条都成立。
- 是测试抓到的，不是 review 抓到的：断言写成 `[null, undefined, 'n/a', NaN, -1]` 逐个不得结算，
  而不是只测一个 `NaN`。**校验函数的测试要覆盖"各种形态的空"，只测一种等于没测。**

## 一个按比例描述的问题，用降低总量去修，比例不会动（2026-08-13）

- 2026-07-30 记录过：台账每次捕获约 11,000 行，其中 **64%** 是多到期日排列、结构上无法评分。
  采取的修复是「每标的只捕获前 3 名」，行数从 11,000 降到约 130。
- 2026-08-13 复测：比例是 **60%**。降了 4 个百分点。
  因为前 3 名本身就被 Diagonal 垄断——**削掉的和留下的构成一样**。
- 症状（"台账里绝大多数行没法评分"）确实随行数下降而变得不那么刺眼，
  所以这个修复看起来生效了，实际上问题原封不动，还多了一层"已经处理过"的假象。
- **教训**：修复动作要作用在**被测量的那个量**上。问题写成比例，就要有一个改变比例的机制；
  减少分母和分子的同类项，比例只会原地不动。
  读到旧记录里"已修复"时，**先确认当时的修复动作和当时的问题描述是不是同一个量纲**。

## 一次性工作不能和可重复工作共用同一道闸门（2026-08-14）

- 报价调度器有两道闸门：队列深度上限（别让扫描堆积得比串行 worker 消耗得快）
  和「报价清单为空就早返回」。两道都合理——**对可重复的工作而言**。
  被深度上限推迟的标的下个周期会被捡起，清单修好后扫描照常继续。
- 台账结算不是可重复的：多到期日候选的远腿**只有近腿到期那一天**可以定价，
  之后链快照被剪、更晚的报价属于另一天。**被推迟一次就是永久丢失。**
- 上线当天实测：19 个待结算标的里 6 个不在报价清单内、13 个到中午一个没轮到。
  照原逻辑，一个与结算完全无关的清单问题就能连带取消当天全部结算。
- **教训**：给一段逻辑加限流/降级/跳过闸门时，先问「被它挡下的工作，有没有下一次机会」。
  有的话闸门是对的；没有的话，这道闸门是在**拿一个只对可等待工作有意义的平滑性，
  去换一个不可恢复的损失**。两类工作必须走各自的路径，而不是靠调优先级区分——
  优先级只决定顺序，闸门决定做不做。
- 顺序也要检查：永久损失的那条路径必须排在可恢复损失的早返回**之前**。

## 一个字段换了更好的口径，可能正好打掉另一个消费者依赖的东西（2026-08-14）

- 报价清单的排序键从 `total_oi` 改成 `underlying_dollar_volume`，是个干净的修复
  （前者被自己的存储上限系统性污染，详见前一条）。清单同时从 50 扩到 100。
- 但换键之后，GME/MARA/OXY/RGTI/RKT/XLP 这些成交额不高的名字掉出了清单。
  它们恰好是**第二天要结算的台账标的**——而台账取价依赖「这个标的今天被报过价」。
  修复上线到副作用显形，隔了不到 24 小时。
- 这不是排序键改错了。是**清单成员资格这一个信号，被两个问不同问题的消费者共用**：
  「哪些标的值得长期报价以供发现」和「哪些标的今天不报就永久丢失」，
  答案本来就不必相同。
- **教训**：改一个被多处消费的派生字段/清单时，列出它的全部下游，
  逐个问「这个下游要的是不是同一个语义」。语义不同的，
  **让下游各自表达自己的需求**（这里是让结算路径自己查台账），
  而不是把它塞进同一个清单的排序里去妥协。

## 写入即终态：只查 `WHERE outcome IS NULL` 的结算器，第一次写什么就是什么（2026-08-15）

- 台账结算器每轮取 `outcome IS NULL AND expiry < today`，算完就 `UPDATE`。
  于是**写入这个动作本身**就是终态化——行不再满足查询条件，永远不会被重看。
  代码里没有任何一处写着"终态"，这个语义是查询条件和无条件写入两者**合起来**产生的。
- 后果：Polygon 当天还没发布日线（采集器自己警告 `270/319 symbols behind`），
  79 行全部被写成 `no_price` 并永久定格——其中 64 行的一次性远腿报价当天下午刚抓到、
  存得好好的，**一次都没被读到**，因为收盘价的检查排在远腿之前。
- **教训**：任何"算一次就落库"的流程，都要显式区分**「还没有」和「不会有」**。
  区分依据是原因，不是结果：日线是迟到的数据（过去某天的收盘是既成事实，等它到位再算不算 look-ahead），
  一次性报价是错过就没有（结算日过去就不可能再有，永远重试只是推迟已确定的结论）。
  前者留 NULL 等下一轮 + 加宽限期兜底，后者立即终态。
- **顺带**：多个检查串行时，**排在前面的失败会掩盖后面的**。这里收盘价缺失挡住了远腿检查，
  于是日志和数据都看不出远腿其实是齐的。落库一个 `resolution_reason` 就能直接读出来——
  这次是靠 `underlying_at_expiry IS NULL` 反推的，只因两种失败恰好在该列上不同，纯属运气。
- 更大的教训：这和同一批工作要修的主问题（把"没人去取价"写成"结构上不可评"）
  **是同一个形状**——都是把可恢复的缺口登记成了不可变的属性。
  修完一个之后应该立刻问：**同一个形状在这条链路上还有没有第二处。** 当时没问，隔了一天才发现。

## 纯函数上的单测，不能证明这个函数在生产路径里生效（2026-08-15）

- `interleaveByStrategy` 有完整单测、有一段写得很清楚的注释，说明为什么全局排序会让
  枚举组合数最多的策略族霸占榜首（Diagonal 6,761 个 vs Long Put 414 个，16 倍）。
  它在 `buildActionableSetups` 末尾被正确调用。
- 然后 `buildCandidateBatch` 把结果**按分数全局重排**，一行代码抹掉全部效果。
  单测全绿，因为它测的是函数本身；抹掉发生在**调用方的上一层**。
- 实测后果：物化批次前 20 名清一色 Diagonal、只有两个标的，而物化批次正是
  `/api/v1/scanner/candidates` 和 `candidate_ledger` 的数据来源。
- 顺带发现第二处：那个全局排序读的是 `score` 而不是 `effectiveScore`，
  于是 `directionalWeight` 辛苦算出的方向/gamma 加权**算完即弃**。
- **这是仓库第二次踩同一形状**：`directionalWeight` 本身也曾长期完全空转，
  因为两个真实调用方都不传 `environment`，而单测直接调用纯函数、一直是绿的。
- **教训**：给一段逻辑写完单测后，**再从真实调用点反向走一遍**，确认它的输出
  没有在下游被覆盖、重排或忽略。"函数正确"和"特性生效"是两件事，
  只有后者是用户能看到的。断言要落在**调用方产出的最终结构**上，而不只是纯函数的返回值。

## 同一个 API 里，符号可能要传两次，而只有一处做了转换（2026-08-15）

- IB 的 `reqSecDefOptParams(reqId, symbol, ..., conId)` 把标的符号作为**独立参数**，
  而不是从 Contract 里取。我们的 `_stock_contract` 一直正确转换 `BRK.B → BRK B`，
  所以 contractDetails 成功、conId 正确；但这个调用漏了转换，
  IB 收到"正确的 conId + 不认识的符号"，直接返回空。
- **症状离根因很远**：日志写的是"option params timed out"，看起来像伯克希尔期权链太大拉不动。
  实测同一个 conId，`'BRK B'` 0.06 秒返回、`'BRK.B'` 返回空——**和链大小毫无关系**。
- **一个坏标的能拖垮整条串行通道**：它每 20 分钟重排一次、每次耗满 30 秒，
  当天 22 个失败里 11 个是它自己，另外 11 个是排在它后面被饿死的
  （包括 SPCX、NVDA、TSLA 这些高优先级标的）。**故障放大了一倍。**
- **教训一**：转换函数存在 ≠ 转换到位。要检查的是**每一个接受符号的参数**，
  不是"这个模块有没有转换函数"。
- **教训二**：找到根因之后不要再顺手加"失败退避"。退避是给**无法消除的**失败用的；
  给已定位的 bug 加退避，等于把它变成一个更难发现的慢性问题。
