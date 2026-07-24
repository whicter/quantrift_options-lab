# 竞品分析 — newshock.net / alphastockpro.com / getnextpick.com（2026-07-18）

> 方法：静态抓取（WebFetch）各站公开页面 + 定价/功能清单还原。浏览器接管两次被拒故未截图。
> 覆盖度：newshock 的 Monitor/Themes/Events 深抓（/stocks 404）；alphastockpro 的 /market
> 功能与定价目录完整、/breadth 深抓（Pro/Elite 内页在登录墙后，功能以其自述清单为准）；
> nextpick 的首页/定价/discoveries/briefing 深抓（app 内页 JS 渲染，功能以首页自述为准）。
> 推断的算法均标注"推断"。
>
> **⏳ 待复查（2026-07-18 记录）**：用户计划注册试用 alphastockpro（Pro/Elite）与 nextpick
> （30 天免费试用），拿到登录态后需重新逐页深挖付费内页——alphastockpro 的 Trend Matrix /
> 3D Matrix / Momentum Radar / 30-Min Breakout Scanner / Reddit Trends / Tactical Swings
> 实页与打分算法证据；nextpick 的 Sector Flow RRG 实图 / Stock Analysis 详情 / AI 研报样例 /
> bot 逐笔交易日志。复查后更新本文档并校正 R1-R4 优先级。对应 task.md「竞品复查」条目。

---

## 一、三个竞品各自是什么

### 1. newshock.net — 「叙事/主题引擎」（新闻 → 主题 → 股票）

**核心对象是 THEME（叙事主题），不是股票。** 40 个进行中主题，每个主题卡带：

- 热度四档（Top/High/Mid/Low），按 **7D Heat**（7 日热度）排序
- 生命周期阶段（early/mid/exit）+ Active/Cooling 状态 + 已持续天数/预期持续（1-3 月 vs 12+ 月）
- **事件计数与速度**（如 "98 events · 1d ago"；AI Capex 主题 771 events vs 冷门主题 7 events）
- 关联股票篮子（5 个 ticker + "+X more"）
- 子主题树（主题 → 二级 → 三级，按相关度排序）

**Events 流水线**：新闻源（GDELT、Defense News、FT、Seeking Alpha、Yahoo、CoinDesk、Mining.com、World Nuclear News…）→ 事件卡：时间戳 + 来源 + **严重度标签（Critical/High/Candidate）** + 主题归类（有 "Pending classification" 待归类态）+ 关联股票 + **"Reason"（为什么对市场重要）**。

**推断算法**：新闻聚类/LLM 分类生成主题；热度 = 事件速度 × 成员股表现；生命周期由事件流衰减判定。"Pending classification" 说明有置信度阈值 + 分类器管道。

**定位**：回答「**为什么动**」——资金背后的叙事。免费，变现路径不明（可能 B2B）。

### 2. alphastockpro.com — 「一个分数 + 一个分类」的动量平台

**核心对象是 0–100 动量分**，覆盖美股指数/11 个 SPDR 板块/600+ 个股，三时间框架：

- Long Term（周线）免费；Medium Term（日线）Pro；Composite（30m+日+周综合排名）Elite
- 分档语言极简："0-30 强空 / 31-49 偏空 / 50-59 中性 / 60-79 偏多 / 80-100 强多"
- Slogan："A 0–100 score that helps you decide when to buy, when to wait, and when to get out."

**Trend Matrix（其最好的想法）**：把股票自动分类为 5 个**可操作状态桶**——
**Strong Uptrend / Buy the Dip / Bottom Fish / Range Breakout / Bear**。这是"决策语言"而非指标堆砌。

其余功能：SPX Breadth（% above MA50/200 vs 指数价）、StochRSI+KDJ 买点、Dual Confirmation、MA10 趋势/距离、日线趋势线突破、30 分钟 Momentum Radar + 突破扫描（Elite）、Mega Cap 轮动、**中国市场（CSI300/创业板）**、**Reddit 社交趋势（4 周跟踪）**、CSV 导出、**中英双语**、"数据每 5 分钟更新"承诺。

**定价**：Free / Pro $249/年（Most Popular）/ Elite $499/年。

**推断算法**：分数 = MA 距离 + StochRSI/KDJ 状态 + 突破邻近度的归一化动量合成；Matrix = 分数+趋势状态的规则分类。无期权、无基本面、无新闻。

### 3. getnextpick.com — 「AI 分析师 + 板块轮动 + 公开实盘 bot」

- **Sector Flow**：11 个 SPDR 板块 ETF——1 日涨跌 + **MFI 资金流向** + **RRG 相对轮动图**（vs SPY 基准，leading/lagging 计数），输出轮动叙事（"Tech → Utilities/Healthcare"）
- **Discoveries**：8 个预制筛选器（Undervalued Growth / Most Shorted / Top Gainers…），列 = 价格/52 周区间/量/市值/PE/fwd PE/P B + 评级
- **Stock Analysis**：多周期技术面 + S/R + **买卖信号带入场/止损/目标价**（注意：这在我们的合规文案边界之外）
- **Smart Money**：期权异动大单警报（$M 量级）、**SEC 10-K/8-K 监控 + AI 摘要**
- **AI 研究**：个股报告（业务/估值/多空论点）+ 1-5 星评级
- **Quant Engine（其最好的想法）**：**公开 live paper-trading 记录**——+23.8%（2026 年 2 月起）vs SPY +14.6%、胜率 58.9%、最大回撤 -5.3%、555 笔——这是**可验证的信任资产**
- **Daily AI Briefing**：每日 AI 市场简报，带 Share / Copy link / **Post on X** 分享
- **定价**：credits 制——Demo $0（3 credits）/ Lite $14.9 / Basic $99 / Premium $199 月付 + 加油包（$0.9-1.5/credit）；30 天全功能试用免卡

---

## 二、对照我们（quantrift options-lab）：哪里做得不好

### 我们的护城河（三家都没有的）

期权原生分析：GEX by strike + 全局/局部 Gamma 对话、Call/Put Wall、Gamma Flip、PCR(OI/Vol)、
**完整 IV 期限结构 + skew**、预期波动、OI 密度、**带腿/POP/经济性的策略候选**、组合 Greeks、
自算 IV Rank（进行中）、synthesis 层（今日核心结论/波动归因/一致分歧检测）、诚实模型披露文化。
nextpick 只有"期权异动警报"一项沾期权。**这个差异化必须守住并继续加深。**

### 差距清单（按严重度）

| # | 差距 | 对标 | 严重度 |
|---|---|---|---|
| G1 | **完全没有新闻/叙事层**。波动归因里"消息面"只能到"隔夜跳空"粒度；没有事件流、没有"为什么动"的文字 | newshock 整个产品 | 🔴 内容层最大缺口 |
| G2 | **没有单一可读的决策语言**。我们输出一堆数字，用户自己合成；没有"我 200 个标的里现在哪些是回调买点"的横截面分类视图。Focus Score 存在但无 reasons 且藏得深 | alphastockpro 0-100 分 + 5 桶 Matrix | 🔴 认知负担最大来源 |
| G3 | ~~没有板块/轮动视图；没有 breadth~~ **breadth 部分已补(2026-07-23,R2.2)**：`/api/market/breadth` + 首页 Market Internals 面板给出**期权原生 breadth**(% 正/负 Gamma、IV Rank 分布、PCR 分布 + % above MA50/200),这是三家都没有的。仍缺:板块聚合/轮动 RRG 视图(R1.3,universe 有 sector 字段但无聚合页) | nextpick RRG、alphastockpro 板块分+Breadth | 🟡→🟢(breadth 已闭合,轮动待 R1.3) |
| G4 | **没有可验证的公开记录**。候选从不回头验证（我们自己 task 里就记着"打分权重未经验证"）；用户无从建立信任 | nextpick 公开 paper bot 记录 | 🔴 信任层缺口 |
| G5 | **没有每日简报/可分享物**。有 per-symbol synthesis 但没有市场级日报，没有任何分享/传播机制 | nextpick briefing + Post on X | 🟡 |
| G6 | **单语言（zh-CN）**。alphastockpro 中英双语直接吃两个市场 | alphastockpro | 🟡 |
| G7 | 财报日历只在候选卡出警告；无日历视图、无财报前后 IV 行为展示（数据已有 `earnings_date` + IV 历史） | newshock 事件流的子集 | 🟢 低成本 |
| G8 | 变现包装落后：Free/Pro 骨架等 Stripe 密钥;对方已有清晰价格锚（$249-499/年、credits 制) | 三家 | ⏸ 外部阻塞 |

### 明确不抄的（我们的边界）

- **不做**带入场/止损/目标价的"买卖信号"(nextpick 有)——违反我们 Page Copy Audit 的合规边界,也是我们与它们的信誉差异点
- **不做**真金交易 bot;paper 记录可以做(见 R2.1),但定位是"模型验证",不是"跟单"
- **不放弃**模型披露文化换取"AI 荐股"式的爽感文案

---

## 三、Roadmap

### R0 — 主线不动摇（进行中）
IV Rank 自给自足 Phase 2.5 → 3 → 4 → 5(Mac 可关机)。所有新功能不得挤占该主线。

### R1 — 决策语言层（性价比最高：全部只用已有数据,同 synthesis 层套路）
- **R1.1 Symbol State Matrix(对标 alphastockpro Trend Matrix,我们输入更丰富)**:
  规则分类全 universe ~200 标的为 5-6 个可操作状态(强势上行/回调买点/底部试探/区间突破/
  空头/高波动观望),输入 = 已有的 Kalman 趋势+多周期动量+GEX 环境+IV Rank+RVol。
  每个分类带 reasons(synthesis 层同款)。**顺带解决 scanner 多样性问题**(先按状态分桶再出候选)。
- **R1.2 每日市场简报(对标 nextpick briefing + 竞品日报)**:
  市场级 synthesis——universe 状态分布(=穷人版 breadth)、板块聚合、SPY/QQQ gamma 环境、
  IV 面貌(高/低 IV rank 分布)、top 期权异动、明日财报。每日物化一份,可分享链接/图卡。
- **R1.3 板块轮动视图(对标 RRG)**:
  按 sector 聚合已有 per-symbol 数据:平均动量状态、% above MA、gamma regime 分布、
  IV rank 分布;相对强度 vs 强度动量的四象限散点(简版 RRG)。零新采集。

### R2 — 信任与验证层
- **R2.1 候选结果台账(对标 nextpick bot 记录,诚实版)**:
  V3A-2 已物化每批候选(表都在!)——加结果评分:到期/N 日后逐候选记实际盈亏、POP 校准
  (预测 68% 的桶实际赢了多少)、按策略族胜率。成熟后开公开"模型记录"页。
  **一石二鸟:这正是拟合打分权重需要的标注数据(我们已知的技术债)。**
- **✅ R2.2 Breadth 模块(2026-07-23 前后端完成)**:% of universe above MA50/200 + 期权原生市场体征
  (% 正/负 Gamma、IV Rank 中位数+p25/p75、PCR 分布)——这是三家都没有的"期权版 breadth"。
  实现:`GET /api/market/breadth`(纯 SQL 聚合 scan universe)+ 首页 Market Internals 面板
  (`components/MarketInternals.jsx`,Gamma 拆分条主视觉 + IV/PCR 分位带轨道)。每块带 `counted` 诚实披露样本量。
  详见 `docs/validation/OPTIONS_BREADTH_2026-07-23.md`。

### R3 — 叙事层（对标 newshock;需要新数据源,排在 IV Rank cutover 后或与之并行于 Railway）
- **R3.1 财报/事件日历页**(数据已有,纯展示)+ 财报前后 IV 行为(IV 历史已回填,能画"财报 IV 冲高-坍缩"曲线)。
- **R3.2 新闻摄取 MVP**:免费源(GDELT/RSS)→ LLM 分类为事件卡(严重度+关联标的+为什么重要),
  接入 Analyze 的 per-symbol 事件流,并**升级波动归因的"消息面"槽位**(从"隔夜跳空"到具体 headline)。
- **R3.3 主题聚类(newshock 式)**:仅当 R3.2 验证了用户参与度后再做。

### R4 — 打磨/商业化
- EN/ZH 双语(吃第二个市场)、分享卡片、CSV 导出(Pro 权益)、
  Stripe 密钥就绪后用 $249-499/年 与 credits 制作为定价锚参考。

### 排序依据
R1 全部是既有数据的派生(和 synthesis 层一样的高杠杆),先做;R2.1 复用 V3A-2 基础设施且
偿还已知技术债;R3 需要新摄取管道,不与 Mac 独立目标抢资源;R4 部分被外部密钥阻塞。
