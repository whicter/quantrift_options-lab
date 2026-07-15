# Temp Task — 功能对标 + Polygon 数据接入规划

> 基于参考产品截图（华尔街咖啡馆 MRVL/META 盘中即时分析 + Nokia 周复盘）
> 目标：在现有 UI 基础上，接入真实数据，做到同等甚至更好

---

## 一、参考产品截图功能清单 vs 我们现状

### /analyze 盘中即时分析

| 功能 | 参考产品有 | 我们现状 | 差距 |
|---|---|---|---|
| Ticker + 中文名 + logo | ✅ | ✅ 已做 | — |
| IV Rank 仪表条 | ✅ | ✅ 已做（Tastytrade 数据）| — |
| 财报日警告 | ✅ | ✅ 已做（mock）| 需接真实财报日 |
| Sector chips | ✅ | ✅ 已做 | — |
| Q&A 分析卡（3问）| ✅ | ✅ 已做 | — |
| GEX 正负 Gamma 环境判断 | ✅ | ✅ 已做（mock 数据）| 需接真实 GEX |
| GEX by Strike 发散柱图 | ✅ | ✅ 已做 | 需接真实数据 |
| Call Wall / Put Wall 标线 | ✅ | ✅ 已做（mock）| 需接真实计算 |
| 当前价标线 | ✅ | ✅ 已做 | — |
| PCR(OI) + PCR(Vol) | ✅ | ✅ 已做（mock）| 需接真实数据 |
| IV ATM | ✅ | ✅ 已做（TT 真实）| ✅ 已是真实 |
| 期权大单异动列表 | ✅ | ✅ 已做（mock）| 需接真实 OI delta |
| 价格区间 chip（$put~$call）| ✅ | ✅ 已做 | — |
| OI 密度分布图（信号追踪）| ✅ | ✅ 已做（GEX 代替 OI）| 需接真实 OI |
| Kalman Filter 趋势图 | ✅ | ✅ 已做（mock 价格）| 需接真实价格 |
| Trend Spread 动量柱 | ✅ | ✅ 已做 | — |
| RVol 相对量能 | ✅ | ✅ 已做（mock 0.x）| 需接真实量能 |
| 技术信号（MA/RSI/MACD）| ✅ | ✅ 已做（mock）| 需接真实计算 |
| 多空剧本 playbook | ✅ | ✅ 已做（mock 触发价）| 需基于真实 Wall 生成 |
| 策略推荐卡（具体参数）| ✅ | ✅ 已做（mock）| 逻辑可用，参数需真实 IV |
| **Gamma Flip 指标** | ❓不确定 | ❌ 未做 | 可做得更好 |
| **Local Gamma 集中度** | ❓不确定 | ❌ 未做 | 可做得更好 |
| **IV Skew 曲线图** | ✅ 参考有 | ❌ 未做 | 需期权链 IV by strike |
| **期限结构图（Term Structure）**| ✅ 参考有 | ❌ 未做 | 需按 expiration 聚合 IV |

### /weekly 周复盘

| 功能 | 参考产品有 | 我们现状 | 差距 |
|---|---|---|---|
| 公司 logo + 中文名 | ✅ | ✅ 已做 | — |
| 5 日 K 线 Canvas | ✅ | ✅ 已做（mock）| 需接真实收盘价 |
| CME 情绪仪表盘 | ✅ | ✅ 已做（mock）| 可接真实恐慌贪婪指数 |
| Gamma 迁徙时间轴（Mon-Fri）| ✅ | ✅ 已做（时间轴滑块）| 需接真实每日 GEX 快照 |
| Call/Put Wall 迁移追踪表 | ✅ | ✅ 已做 | 需真实数据 |
| Max Pain vs 收盘价偏离 | ✅ | ✅ 已做（mock）| 需真实 Max Pain 计算 |
| Smart Money 流向图 | ✅ | ✅ 已做（mock）| 需真实大单流向数据 |
| 下周多空剧本 | ✅ | ✅ 已做（mock）| 需基于真实 Wall/GEX 生成 |

---

## 二、我们可以做得更好的功能（参考产品没有或弱）

1. **Gamma Flip 专项指标**
   - 构建 spot ±10% price grid，对每个价格点重新计算 net GEX
   - 找到 net GEX 过零点 → 标注 Gamma Flip 价位
   - 前端显示：当前价 vs Flip 距离、regime（positive/negative/near flip）
   - 参考产品没有明确展示此指标

2. **Local Gamma 集中度**
   - 当前价 ±1 ATM expected move 范围内的 GEX 集中度
   - 量化"现价附近做市商对冲压力"，比单纯 Call/Put Wall 更精准

3. **IV Skew 可视化**
   - 同一到期日，各行权价 IV 画成曲线（微笑/偏斜）
   - put skew 斜率 → 市场恐慌程度量化

4. **GEX 历史对比**
   - 本周 vs 上周同一 strike 的 GEX 变化
   - 识别 GEX 在哪些 strike 明显增加 → 机构建仓信号

5. **自动策略参数生成**
   - 基于 GEX 环境 + IV Rank + DTE → 自动输出 Short Delta 范围、宽度建议
   - 比参考产品更量化

6. **Unusual Activity 自建版**
   - 每日 OI delta 追踪：今日 OI - 昨日 OI，异常大 = 新建仓
   - volume/OI 比 > 2 = 扫单信号
   - 无需付费 Unusual Whales，完全自建

---

## 三、Polygon.io 订阅规划

### 订阅方案
- **Polygon.io Options Starter，$79/月**
- 包含：实时+历史期权链、OI、volume、gamma、delta、IV、bid/ask
- 商用条款明确，支持再分发
- 历史数据可补采，加速 IV Rank 积累

### 订阅后数据架构

```
过渡期（订阅起 → 积累满252交易日）：

  Polygon.io API
    └── 每日快照采集（期权链）
          ├── OI / volume / gamma / delta / IV by strike+expiration
          ├── 写入 option_chain_snapshots 表
          └── 触发计算：GEX / PCR / Call Wall / Put Wall / Max Pain / IV Skew

  Tastytrade API（保留，仅取 iv_rank）
    └── iv_rank / iv_percentile（无需自算，冷启动用）
    └── 财报日 expected-report-date

  yfinance（免费）
    └── 60天 OHLCV → price_history 表
    └── HV30/60/90 自算
    └── 财报日 fallback

  Railway PostgreSQL
    ├── iv_history（IV 历史，积累中）
    ├── option_chain_snapshots（每日期权链快照）
    ├── gex_snapshots（计算结果：GEX/Wall/PCR/MaxPain）
    └── price_history（价格历史）

  Railway Node.js API
    ├── /api/metrics?symbols=   ← IV Rank（TT）+ iv30（Polygon）
    ├── /api/prices/:symbol     ← 价格历史（yfinance）
    ├── /api/gex/:symbol        ← GEX by strike / Wall / Flip / Local Gamma
    └── /api/chain/stats/:symbol ← PCR / Max Pain / IV Skew

满252交易日后：

  Polygon.io → 全部期权链数据
  Tastytrade → 停掉（IV Rank 自算）
  yfinance   → 价格历史 / HV / 财报日 fallback
```

### 需要新建的 PostgreSQL 表

```sql
-- 每日期权链快照（原始数据）
option_chain_snapshots (
  id, symbol, underlying_price, snapshot_ts,
  expiration, dte, strike, type,
  open_interest, volume, implied_volatility,
  delta, gamma, bid, ask, mid, source
)

-- 计算结果快照（GEX/Wall/PCR 等）
gex_snapshots (
  id, symbol, snapshot_ts,
  global_gex, local_gamma, gamma_flip,
  call_wall, put_wall, max_pain,
  pcr_oi, pcr_vol,
  gamma_regime,           -- 'positive'/'negative'/'near_flip'
  spot_vs_flip_pct,       -- 当前价距 Gamma Flip 的百分比
  payload JSONB           -- gex_by_strike 完整数组
)

-- 价格历史（yfinance）
price_history (
  symbol, date, open, high, low, close, volume
)
```

### 新增 collector 模块（Mac Studio）

```
collector/
  ├── auth.py          ← 已有（TT 认证）
  ├── collect.py       ← 已有（TT IV 采集）
  ├── collect_chain.py ← 新建：Polygon 期权链采集 + GEX 计算 + 写库
  └── collect_price.py ← 新建：yfinance 价格采集 + HV 计算 + 写库
```

`collect_chain.py` 逻辑：
1. 调用 Polygon `/v3/snapshot/options/{symbol}` 拿完整期权链快照
2. 计算 GEX by strike = `Σ(gamma × OI × 100 × underlying_price²)`（call 正，put 负）
3. 找 Call Wall（call side GEX max strike）/ Put Wall（put side abs GEX max strike）
4. 计算 PCR(OI) / PCR(Vol) / Max Pain
5. 构建 price grid，计算 Gamma Flip
6. 写入 `option_chain_snapshots` + `gex_snapshots`

### 新增 server 端点

```
GET /api/gex/:symbol
  返回：global_gex, gex_by_strike[], call_wall, put_wall,
        gamma_flip, local_gamma, gamma_regime, spot_vs_flip_pct

GET /api/chain/stats/:symbol
  返回：pcr_oi, pcr_vol, max_pain, iv_skew[]（by strike）,
        term_structure[]（by expiration）, unusual_activity[]

GET /api/prices/:symbol
  返回：最近60天 OHLCV 数组，rvol（当日量/20日均量）
```

### 前端接入优先级

| 优先级 | 页面/组件 | 当前 | 接入后 |
|---|---|---|---|
| P0 | Tab3 GEX 柱图 | mock gexByStrike | Polygon GEX 计算结果 |
| P0 | Tab3 PCR(OI/Vol) | mock | Polygon 真实 PCR |
| P0 | Tab4 OI 密度图 | mock GEX 代替 | 真实 OI by strike |
| P0 | Tab4 Call/Put Wall | mock | Polygon 真实 Wall |
| P1 | Tab2 KF 趋势图 | mock 价格 | yfinance 真实收盘价 |
| P1 | Tab2 RVol | mock 0.x | 真实量能比 |
| P1 | Tab3 Unusual Activity | mock | OI delta 自建检测 |
| P2 | Tab3 IV Skew 图 | 无 | Polygon IV by strike |
| P2 | Tab1 Gamma Flip 指标 | 无 | 自建计算 |
| P2 | Tab1 Local Gamma | 无 | 自建计算 |
| P3 | Weekly Sec2 真实 Gamma 迁徙 | mock | 每日 GEX 快照 |
| P3 | Weekly Sec3 真实 Max Pain | mock | Polygon OI 计算 |

---

## 四、实施步骤

```
Step 1：订阅 Polygon.io Options Starter
  → 拿到 API Key
  → 测试 /v3/snapshot/options/AAPL 返回字段确认

Step 2：写 collect_chain.py
  → Polygon 认证（简单 API Key，无需 OAuth）
  → 采集目标标的期权链快照
  → 计算 GEX / Wall / PCR / MaxPain / GammaFlip
  → 写入 PostgreSQL

Step 3：写 collect_price.py
  → yfinance 拉 60 天 OHLCV
  → 计算 HV30/60/90、RVol
  → 写入 price_history

Step 4：server 新增端点
  → /api/gex/:symbol
  → /api/chain/stats/:symbol
  → /api/prices/:symbol

Step 5：前端接入（P0 先）
  → Tab3 GEX + PCR + Wall 换真实数据
  → Tab4 OI 密度图换真实 OI
  → Tab2 KF 图换真实价格 + RVol

Step 6：前端接入（P1-P2）
  → Gamma Flip 指标
  → IV Skew 图
  → Unusual Activity 自建版

Step 7：积累252天后
  → 自算 IV Rank，停掉 Tastytrade
```

---

## 五、成本汇总

| 服务 | 月费 | 用途 | 何时停 |
|---|---|---|---|
| Polygon.io Options Starter | $79 | 期权链核心数据 | 长期保留 |
| Railway（PostgreSQL + Node.js）| ~$5 | 数据库 + API | 长期保留 |
| Tastytrade API | 免费 | IV Rank 过渡期 | 积累252天后停 |
| yfinance | 免费 | 价格历史 / HV / fallback | 长期保留 |
| **合计** | **~$84/月** | | |
