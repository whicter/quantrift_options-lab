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
- analyze 已读取 `/api/gex/:symbol`，并在 fresh + high/medium confidence 时用真实 GEX/Walls/PCR/Max Pain 替换 mock shell。
- `tt_internal` 是过渡/internal validation provider；正式产品仍需要购买具备授权和再分发权利的数据源。

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
- `freshness === fresh`
- `is_stale === false`
- `confidence` 为 `high` 或 `medium`
- 有 `global_gex`, `call_wall`, `put_wall`, `strikes`

GEX fallback：
- GEX missing/stale/unusable：保留 IV + price 页面，不把 mock wall/gex 标记成真实。
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
- scanner 仍是 IV-first triage + positioning context，不是完整 contract-level strategy leg selector。
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
- Default scanner profile should be `不限`; contract-level presets are opt-in so a narrow current option snapshot cannot blank the whole scanner.
- Scanner columns need in-context product meaning: IV Rank is historical IV rank, POP is a rules estimate, `ΔOI` is OI delta, and empty Wall means no GEX/Wall snapshot. Do not expose generic internal data-status columns; show actionable states such as `待采集` inside the relevant column. Headers should be sortable.
- Wall is not a standalone provider field in the UI; it is derived from cached option contracts through GEX computation. If a symbol has no latest option contract snapshot, it cannot have Call Wall / Put Wall in scanner.
- Regression coverage must include cross-boundary provider contracts: API enqueue defaults must be executable by the worker, and placeholder providers must fail tests instead of silently producing stuck jobs.
- Scanner strategy labels currently include sell put spread / sell call spread through `Bull Put Spread` / `Bear Call Spread`. Naked `Short Put` / `Short Call` and butterfly variants are in the strategy library but still need recommendation-engine integration.
- Scanner recommendations must be concrete setups, not just strategy names. A useful row should show selected legs, DTE, credit/debit, risk and breakeven when the cached option snapshot supports it; otherwise it must say why setup construction is unavailable.
- Option-chain collection must sample multiple DTE buckets. A global contract cap without a per-expiration cap can silently persist only the nearest selected expiration, which makes scanner recommendations look concrete but strategically incomplete.
- Analyze 技术评分已使用真实 price history 的 MA20/50/200、RSI14、MACD 和 5日变化；MA200 数据不足时保持 null，不伪造。
- 策略矩阵已用 IV Rank + trend score + GEX context 生成策略/DTE/delta/width；当前 legs 是 target fallback，不是完整 live-chain optimal leg selection。
