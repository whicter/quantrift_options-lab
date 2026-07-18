# SPEC — Confluence 支撑阻力引擎(RKLB 对话抢救 + options-lab 对照)

> 来源:`RKLB_跌幅分析与可量化预警框架_dialog.md`(此前**只存在于聊天记录**,本文件为抢救归档)
> 对照:`quantrift_options-lab` 的 `/analyze`(2026-07-17 逐模块实测)
> 对应 PLAN.md 的 **P5**。决策门 **G5**。
> **修订记录 2026-07-18**:options-lab 侧评审完成,"现状对照"逐条核实属实;评审给出 7 点修正
> (合规命名、lookback 定义、聚类具体化、评分数表、G5 对照组改为单点 S/R+历史回放、分侧规则、
> 权重先验化)与 CF-1~CF-5 落地计划,**以 `quantrift_options-lab/docs/task.md` 的
> "2026-07-18 — Confluence 支撑阻力引擎"章节为准**。其中两条直接修订本 spec:
> ① 输出契约的"机构级/Institutional"分档在 options-lab 生产文案中**禁用**(违反 Page Copy
> Audit 边界),改为中性分档"极强/强/中/弱"+"多信号共振强度(模型估算)"表述;
> ② G5 的对照组由 Focus Score(动量分,与价位正交,不可比)改为**现有单点 S/R ±0.5% 带**,
> 且用 250+ 天日线历史回放(gamma 置零)验证,不必等待前瞻窗口。

---

## ⚠️ 头号警告:权重是拍脑袋的,不是拟合的

**那套 `40 / 25 / 15 / 10 / 5 / 5` 权重(Volume Profile / Market Structure / ATR / MA /
Gamma / Fibonacci)是直觉给的,没有任何回测或拟合依据。**

- 它只是对话里"我自己的模型会是"这一句随口给的先验,不是数据得出的结论。
- **连原作者自己都不信它**:v2 升级清单的最后一条就是
  *"Dynamic Weight Optimizer:根据市场状态动态调整,而不是固定 40/25/15/10/5/5"*
  —— 等于承认固定权重是临时的。
- 同样地,Confidence 分档(95-100 机构级 / 85-94 极强 / …)和 Zone 宽度规则也都是拍的。

**处理原则(与 PLAN §5 一致):**
1. 手工权重**只当冷启动先验 + sanity check**,不当结论。
2. 上生产前,G5 必须证明"加权 Zone 比 options-lab 现有的 Focus Score / 单点 S/R 有增量",
   否则**不替换**正在生产跑的东西。
3. 有了标注数据(哪些 Zone 真的挡住了价格)后,权重应当**被拟合/优化取代**,让手工值退休。

---

## 一、它是什么(一句话)

不画单条支撑线,而是把**多个互相独立的信号**在同一价位区域的**共振(confluence)**
合成为:**价格区间(Zone)+ 强度分(0-100)+ 理由清单(reasons)**。

核心信条(原文):*"A price level only becomes institutional support if multiple
independent systems agree. Never trust a single indicator. Never output a single line —
always output price ZONES."*

它与其他三条线正交:那三条预测"会不会/涨跌概率",Confluence 算"在**哪个价位**动手、
止损放哪"。概率决定要不要进场,Zone 决定在哪进。**不需要标签、不需要训练、不需要历史采集**
—— 纯确定性计算,输入只要 OHLCV(+可选期权)。这也是它能不受任何数据阻塞、随时并行做的原因。

---

## 二、六模块规格 × options-lab 对照

**总重叠约 3–4 成:原料有一半,但"合成层"完全没有。**

| # | 模块(权重) | 规格要点 | options-lab 现状 | 结论 |
|---|---|---|---|---|
| 1 | **Volume Profile(40%)** | POC / HVN / LVN;POC=极强支撑,HVN=强支撑,LVN=突破加速区;多 HVN 聚集→加分 | 🟡 `volumeProfile.js:17` 有分箱 + HVN(前5成交量节点);**缺 POC / value area / LVN 语义** | **小改** |
| 2 | **Market Structure(25%)** | Swing/Pivot High-Low(`H[i]>H[i-1] & H[i]>H[i+1]`);双顶双底、higher-low/lower-high、盘整区 | ✅ `supportResistance.js:149` pivot(window=2)+ 1% 聚类 + touches 排序;**缺形态识别(双顶等)** | **复用(可选补形态)** |
| 3 | **ATR Support(15%)** | ATR(14);支撑=`20EMA − 1/2 ATR`,阻力=`20EMA + 1/2 ATR` | ❌ 全源码无 ATR / true range | **新建** |
| 4 | **Moving Average(10%)** | 20EMA / 50EMA / 100EMA / 200SMA;多 MA 重叠→加分 | 🟡 `supportResistance.js:25` 仅 SMA;**缺 EMA** | **小改(加 EMA)** |
| 5 | **Gamma Exposure(5%)** | Call Wall=阻力,Put Wall=支撑,Gamma Flip / Zero Gamma;大 gamma 簇→加分 | ✅ `compute_gex.py` call_wall/put_wall/max_pain/gamma_flip 全有 | **复用** |
| 6 | **Fibonacci(5%)** | 从 Swing Low/High 算 23.6/38.2/50/61.8/78.6 + 扩展 127/161.8;与 POC/HVN/Swing/Gamma 重叠→加分 | ❌ 无 | **新建** |

> **注意模块 5(Gamma)**:options-lab 的 GEX 依赖**实时 OI**(snapshot),历史 OI 拿不到
> (见 DATA_SOURCE §E)。所以 Confluence 的 gamma 模块在**当日/实时**能用,**历史回放不行**。
> 权重只占 5%,对实时 Zone 影响不大,但做历史验证时要把它降权或置零。

### 真正的差距:合成层 + 输出形态(options-lab 完全没有)

这是整个引擎的价值所在,也是工作量重心:

- **options-lab 现在输出的是离散的线/点**:S/R 是 `{price, touches, last_date}` 单价,
  VP 是节点,GEX 是墙价 —— **散在三个独立端点(`/sr`、`/vp`、`/gex`),没有任何一层叠加。**
- **没有 Zone(区间)、没有 0-100 强度分、没有 reasons 列表。**
- 需要新建的合成层做三件事:①把 6 路信号按价位**聚类成 Zone** ②**加权算强度**
  ③**生成 reasons**(每模块贡献了多少,如 `Volume Profile 40/40, Swing Low 20/25`)。

### ⚠️ Focus Score ≠ Confluence(别误当重复)

options-lab 的 `deriveFocusScore`(`supportResistance.js:184`)**是加权复合分,但复合的是
趋势/动量因子**(MA/RSI/涨幅/RVOL),输出**单点分数、无 reasons**,**完全不碰 S/R / VP /
GEX / Fib**。它本质是"这票现在值不值得关注"的动量热度分,与"支撑在哪个区间"正交。
**不能复用为 Confluence 分,合成层需新建。**

---

## 三、输出契约

```
Support Zones
| Rank | Price Zone  | Strength    | Confidence | Reasons                                  |
|------|-------------|-------------|------------|------------------------------------------|
| #1   | 73.8–74.6   | Very Strong | 95         | HVN + Swing Low + Gamma Put Wall + Fib 61.8 |
| #2   | 68.5–69.2   | Strong      | 84         | 50EMA + Previous Consolidation           |

Resistance Zones
| #1   | 90–91       | Very Strong | 94         | Call Wall + LVN + Previous High          |
```

- **永远输出区间,不输出单点。** Zone 宽度由 ATR/波动率决定:高波动→宽,低波动→窄。
- **Confidence 分档**(拍脑袋,见头号警告):95-100 机构级 / 85-94 极强 / 70-84 强 /
  50-69 中等 / <50 弱。
- **可解释**:每个 Zone 要说明各模块各贡献了多少分。
- **风控规则**:价格跌破支撑 Zone 后,要判定"支撑失效"还是"支撑变阻力",
  **重算全部分数,不复用旧 Zone**。

---

## 四、放哪、怎么落地

**建议做在 options-lab,不在研究 repo。** 理由:它复用的 pivot S/R(②)、GEX 墙(⑤)、
Volume Profile(①)、MA(④)全在 options-lab 的 server/collector 里,是**serving 逻辑不是
研究逻辑**。研究 repo 需要时通过 API 调它。

落地形态:新增 `GET /api/confluence/:symbol`,内部:
1. 复用 `/sr`(pivot)、`/vp`(volume profile)、`compute_gex`(墙)的现有产出
2. 新建 ATR 模块、Fibonacci 模块、EMA(补 MA)、POC/VA/LVN(补 VP)
3. **新建 confluence 合成层**:聚类成 Zone → 加权 → reasons → 分档

**决策门 G5**:加权 Zone 必须在前瞻测试里比现有 Focus Score / 单点 S/R **更准**,才上生产。
否则保留现状,别用一个拍脑袋权重的新东西替换正在跑的东西。

---

## 五、v2 升级清单(原作者建议,搁置)

对话里给的进阶模块,**v1 不做**,记档备查:

- **Anchored VWAP Engine(建议 15%)**:从财报/高低点/突破锚定 VWAP,机构高频使用
- **Market Profile / TPO**:VAH / VAL / Initial Balance(比裸 Volume Profile 更细)
- **Liquidity Engine**:流动性池、止损聚集区、Equal High/Equal Low
- **Order Flow Engine**:Delta / CVD / Footprint,判断支撑是真买盘还是假反弹
- **Dynamic Weight Optimizer**:按市场状态(趋势/震荡/高低波动)动态调权,
  **取代固定 40/25/15/10/5/5** —— 见头号警告

---

## 附:原始 Agent Prompt(抢救归档,英文原文)

<details>
<summary>完整 Prompt(可直接作为 options-lab 侧 LLM/Codex 开发规范)</summary>

```text
# ROLE
You are a professional quantitative trading system specialized in identifying
institutional-quality Support & Resistance zones.
Do NOT draw arbitrary horizontal lines. Do NOT use subjective chart reading.
Everything must be computed algorithmically.

# OBJECTIVE
Given historical OHLCV, options data (if available), and current price, identify
institutional support and resistance zones. Prioritize areas where multiple
independent signals converge ("Confluence Zones").

# OUTPUT FORMAT
Return ranked tables of Support Zones and Resistance Zones.
Columns: Rank | Price Zone | Strength | Confidence | Reasons.
Never output a single line. Always output price ZONES.

# METHODOLOGY (weighted combination; weights are a prior, not fitted)
Total = 40% Volume Profile + 25% Market Structure + 15% ATR
      + 10% Moving Average + 5% Gamma Exposure + 5% Fibonacci
Each module computes independently; combine only at the end.

# MODULE 1 — Volume Profile (0-40): POC (very strong), HVN (strong), LVN (breakout accel).
# MODULE 2 — Market Structure (0-25): swing/pivot highs & lows; double top/bottom; HL/LH; consolidation.
# MODULE 3 — ATR Support (0-15): ATR(14); support=20EMA-1/2ATR; resistance=20EMA+1/2ATR.
# MODULE 4 — Moving Average (0-10): 20/50/100 EMA + 200 SMA; overlap increases confidence.
# MODULE 5 — Gamma Exposure (0-5): call wall=resistance, put wall=support, gamma flip.
# MODULE 6 — Fibonacci (0-5): 23.6/38.2/50/61.8/78.6 + ext 127/161.8; overlap boosts confidence.

# CONFLUENCE ENGINE
A level becomes institutional support only if multiple independent systems agree.
Cluster nearby levels into a Zone. Zone width from ATR/volatility.

# CONFIDENCE
SupportScore = sum of module scores, max 100.
95-100 Institutional / 85-94 Very Strong / 70-84 Strong / 50-69 Moderate / <50 Weak.
Explain each zone: which modules contributed, and what % each.

# RISK MANAGEMENT
On break: decide support failed vs support-became-resistance. Recompute all scores.
Never reuse old zones blindly.

# DESIGN PRINCIPLES
Objective, repeatable, quantitative, explainable, deterministic.
No subjective chart reading, no manual lines, no discretionary judgment.
```
</details>
