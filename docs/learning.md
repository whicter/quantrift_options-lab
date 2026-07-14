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

## Current Scanner / Analyze Logic (Phase 3B-3)

当前 scanner 和 analyze 不是完整期权链推荐系统，而是 IV-first 的半真实版本。

### Scanner

真实输入：
- Tastytrade `iv_history`: IV Rank, IV Percentile, IV30, HV30, IV-HV diff, earnings date.
- IB internal `price_history`: latest close, latest price date, price source, price coverage status.

当前过滤：
- `minIvr <= IV Rank <= maxIvr`
- `iv_hv_diff >= minIvHv`
- universe 限定为 watchlist
- 排序按 `iv_rank DESC`

当前策略标签：
- `IV Rank >= 50` → `Iron Condor`
- `30 <= IV Rank < 50` → `Iron Condor`
- `IV Rank < 30` → `Long Straddle`

这些标签是 IV-only educational labels，不是完整推荐。原因：
- 没有真实 option chain bid/ask、OI、volume、Greeks。
- 没有真实 liquidity filter。
- 没有真实 DTE/strike selection。
- 没有真实 POP。
- 没有 GEX / Call Wall / Put Wall / Gamma Flip。
- 没有 MA/RSI/MACD trend engine。

### Analyze

真实部分：
- IV Rank / IV30 / HV30 / earnings 来自 `/api/metrics`
- Latest close / 60日 OHLCV / RVol 来自 `/api/prices/:symbol`

占位部分：
- GEX by strike
- Call Wall / Put Wall
- PCR OI / PCR Volume
- Unusual Activity
- Strategy legs
- Option-chain-derived POP

当前原则：
- 不把 mock shell 伪装成真实 options data。
- 不把 IB internal data 当作公开/付费产品的默认 option-chain data。
- 在没有 chain/liquidity/GEX 前，scanner 只能作为 IV-first watchlist triage。
