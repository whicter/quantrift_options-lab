// Greeks Knowledge Base — comprehensive educational content

export const GREEKS_INTRO = `期权的希腊字母（Greeks）是衡量期权价格对各种市场变量敏感度的指标。
理解 Greeks 是期权交易的核心基础：它们告诉你这个仓位在赚什么、怕什么、会怎么变化。`;

export const GREEKS = [
  {
    symbol: 'Δ',
    name: 'Delta',
    zh: '方向敏感性',
    color: '#10d984',
    tagline: '正股涨 $1，期权价值变化多少？',
    oneliner: 'Delta 是最直观的 Greek：它告诉你这个期权头寸相当于持有多少股正股。',
    sections: [
      {
        title: '基本定义',
        content: [
          'Delta = ∂V / ∂S（期权价值对标的价格的偏导数）',
          'Call 的 Delta：0 到 +1（标的上涨时 Call 价值增加）',
          'Put 的 Delta：-1 到 0（标的上涨时 Put 价值减少）',
          'ATM 期权 Delta ≈ ±0.50（Call 约 +0.50，Put 约 -0.50）',
          'Deep ITM 期权 Delta → ±1（行为像持有正股）',
          'Deep OTM 期权 Delta → 0（几乎不受正股价格影响）',
        ],
      },
      {
        title: 'Delta 的实际含义',
        content: [
          '持有 1 张 Delta=0.50 的 Call 约等于持有 50 股正股的敞口',
          'Short 1 张 Delta=-0.30 的 Put 约等于持有 30 股正股（Long Delta）',
          'Delta 也近似于期权到期时为 ITM 的概率（但不完全等于）',
          '投资组合的总 Delta = 各仓位 Delta 之和 × 各自的合约数量',
        ],
      },
      {
        title: 'Delta 随时间和价格的变化',
        content: [
          '随标的价格上涨：Call Delta 增加，Put Delta 变小（趋近 0）',
          '随到期日临近：ITM 期权 Delta → 1，OTM 期权 Delta → 0',
          '越接近到期日，Delta 在 ATM 附近变化越剧烈（Gamma 效应）',
          '高 IV 环境：ATM Delta 变化更平滑，期权"宽"一些',
        ],
      },
      {
        title: 'Delta 在策略中的应用',
        content: [
          '方向性判断：正 Delta = 看涨，负 Delta = 看跌，接近零 = 中性',
          'Delta Hedge（Delta 对冲）：买卖正股使组合总 Delta → 0',
          '选行权价：ATM（0.50）= 最大 Theta，OTM（0.25-0.35）= 缓冲更大',
          '做市商视角：持续 Delta 对冲消除方向性，通过 Gamma/Vega 盈利',
          'Delta Neutral 组合：主要从 Theta 和 Vega 获利，不赌方向',
        ],
      },
    ],
    keyRules: [
      { rule: 'Long Call → 正 Delta', color: '#10d984' },
      { rule: 'Short Call → 负 Delta', color: '#f25656' },
      { rule: 'Long Put → 负 Delta', color: '#f25656' },
      { rule: 'Short Put → 正 Delta', color: '#10d984' },
      { rule: 'ATM ≈ ±0.50', color: '#f5a623' },
    ],
  },
  {
    symbol: 'Γ',
    name: 'Gamma',
    zh: 'Delta 的变化率',
    color: '#9b6ef3',
    tagline: '标的涨 $1，Delta 变化多少？',
    oneliner: 'Gamma 是期权交易最重要也最危险的 Greek：它决定了你的 Delta 变化有多快。',
    sections: [
      {
        title: '基本定义',
        content: [
          'Gamma = ∂²V / ∂S² = ∂Delta / ∂S（Delta 对标的价格的偏导数）',
          'Long 期权（无论 Call 还是 Put）：Gamma 恒为正',
          'Short 期权：Gamma 恒为负',
          'ATM 期权 Gamma 最大，ITM/OTM 期权 Gamma 较小',
          '接近到期日时，ATM 期权 Gamma 急剧增大（Gamma 风险）',
        ],
      },
      {
        title: 'Gamma 的实际含义',
        content: [
          '正 Gamma（Long 期权）：标的大涨时 Delta 增加（获益更多），大跌时 Delta 减少（损失减缓）→ 凸性优势',
          '负 Gamma（Short 期权）：标的移动越大，损失加速 → 凹性风险',
          '例：持有 Gamma=0.05 的 Long Call（Delta=0.50），标的涨 $1 → Delta 变为 0.55',
          'Gamma 是"波动率的朋友"：正 Gamma 头寸从实际波动中获益',
        ],
      },
      {
        title: '到期日临近时的 Gamma 风险',
        content: [
          '到期日前 1-2 周，ATM 期权 Gamma 可能是 30 天前的 5-10 倍',
          '这就是为什么 Short Straddle/Strangle 需要在到期前 21 天关仓',
          '做市商在到期日前需要极频繁地 Delta 再对冲来管理 Gamma 风险',
          '周期权（0DTE）的 Gamma 极大：每 1% 的价格移动 Delta 变化剧烈',
        ],
      },
      {
        title: 'Gamma 在策略中的应用',
        content: [
          'Long Gamma 策略：Long Straddle/Strangle，适合大幅波动',
          'Short Gamma 策略：Iron Condor，Short Strangle，适合震荡市',
          'Gamma Scalping：对冲 Delta 后，靠正 Gamma 从波动中获益',
          '判断风险：Short Gamma 头寸在到期日前必须认真对待',
        ],
      },
      {
        title: 'GEX 与市场微观结构',
        content: [
          'GEX（Gamma Exposure）= 做市商持有的净 Gamma 敞口 × OI × 合约规模 × 标的价格',
          '做市商通常是期权的净卖方对家：他们 Short Gamma，需要持续 Delta 对冲',
          '正 GEX（做市商净 Long Gamma）：标的上涨时做市商卖出股票 → 抑制波动，VIX被压制',
          '负 GEX（做市商净 Short Gamma）：标的上涨时做市商买入股票 → 放大波动，VIX容易飙升',
          '"Gamma Flip"：GEX 从正转负的价格水平，突破后市场进入高波动模式',
          '高 OI 行权价处 GEX 最集中，形成强支撑/阻力（Pin Risk）',
          '0DTE 期权（日到期）已占 SPX 成交量 50%+，大幅加剧了日内 GEX 效应',
        ],
      },
    ],
    keyRules: [
      { rule: 'Long 任何期权 → 正 Gamma', color: '#10d984' },
      { rule: 'Short 任何期权 → 负 Gamma', color: '#f25656' },
      { rule: 'ATM 期权 Gamma 最大', color: '#9b6ef3' },
      { rule: '接近到期 Gamma 急增', color: '#f5a623' },
      { rule: '正 Gamma = 从波动中获益', color: '#10d984' },
    ],
  },
  {
    symbol: 'Θ',
    name: 'Theta',
    zh: '时间价值衰减',
    color: '#f5a623',
    tagline: '每过一天，期权价值减少多少？',
    oneliner: 'Theta 是时间的代价：期权买家每天付出时间价值，期权卖家每天收取时间价值。',
    sections: [
      {
        title: '基本定义',
        content: [
          'Theta = ∂V / ∂t（期权价值对时间的偏导数，通常为每日变化）',
          'Long 期权：Theta 为负（每天损失时间价值，是"保费"）',
          'Short 期权：Theta 为正（每天收取时间价值，是"收入"）',
          'ATM 期权 Theta 最大，随 ITM/OTM 程度增加而减小',
          'Theta 随到期日临近而加速（平方根关系：DTE 减半，Theta 增加约 1.4 倍）',
        ],
      },
      {
        title: 'Theta 衰减的非线性',
        content: [
          '期权价值并非线性衰减：最后 30 天衰减最快',
          '90 DTE → 45 DTE：损失约 30% 时间价值',
          '45 DTE → 0 DTE：损失剩余 70% 时间价值',
          '实践规律：30 DTE 之后是 Theta 衰减的"甜蜜区"（卖方收益最高效率）',
          '周末/假期：Theta 仍在计算但市场不交易（通常周五 Theta × 3 计入）',
        ],
      },
      {
        title: 'Theta 与 IV 的关系',
        content: [
          'IV 越高，期权时间价值越大，Theta 绝对值越大',
          '高 IV 时卖出期权每天收取的 Theta 更多（这是高 IV 卖方策略的核心）',
          '事件驱动 IV 膨胀：财报前 Theta 很高，财报后 IV 崩塌，Theta 急剧减少',
          'Theta/Vega 比率：衡量每单位 Vega 风险换取多少 Theta 收益',
        ],
      },
      {
        title: 'Theta 在策略中的应用',
        content: [
          'Theta 正策略（卖方）：Covered Call，CSP，Iron Condor，Short Straddle',
          'Theta 负策略（买方）：Long Call/Put，Long Straddle，Long Calendar',
          '30-45 DTE 出售期权：Theta 衰减最高效（$/时间单位）',
          'DTE 管理：买方避免持有 < 21 DTE；卖方在 < 21 DTE 时考虑关仓',
          '每日 Theta 收益的现实：$2 Theta/天 × 100 合约 = $200/天（但仍有方向和 Vega 风险）',
        ],
      },
    ],
    keyRules: [
      { rule: 'Long 期权 → 负 Theta（每天亏时间价值）', color: '#f25656' },
      { rule: 'Short 期权 → 正 Theta（每天收时间价值）', color: '#10d984' },
      { rule: 'ATM Theta 最大', color: '#9b6ef3' },
      { rule: '30 天内 Theta 加速', color: '#f5a623' },
      { rule: 'Theta 与 Gamma 永远相反符号', color: '#3b82f6' },
    ],
  },
  {
    symbol: 'ν',
    name: 'Vega',
    zh: '波动率敏感性',
    color: '#3b82f6',
    tagline: 'IV 变化 1%，期权价值变化多少？',
    oneliner: 'Vega 是期权的波动率敏感度：它决定了你的仓位是"做多 IV"还是"做空 IV"。',
    sections: [
      {
        title: '基本定义',
        content: [
          'Vega = ∂V / ∂σ（期权价值对隐含波动率的偏导数）',
          '通常表示 IV 变化 1% 时期权价格的变化量（单位：$/1% IV）',
          'Long 期权（Call 或 Put）：Vega 恒为正（IV 上升时期权变贵）',
          'Short 期权：Vega 恒为负（IV 上升时期权亏损）',
          'ATM 期权 Vega 最大；ITM/OTM Vega 较小',
          '长 DTE 期权 Vega 远大于短 DTE 期权（Vega ∝ √T）',
        ],
      },
      {
        title: 'IV 和 Vega 的实际影响',
        content: [
          '例：持有 Vega=15 的 Long Straddle，IV 上升 5% → 盈利 $75/张',
          '财报 IV 崩塌（IV Crush）：IV 从 80% 跌到 40% → Long Vega 亏损惨重',
          'IV Crush 是期权买家最常见的亏损来源之一（即使方向正确也亏损）',
          'LEAPS 的 Vega 极大：IV 变化 10% 可以产生巨大的 P/L 波动',
        ],
      },
      {
        title: 'Vega 与 DTE 的关系',
        content: [
          'Vega ∝ √T：DTE 从 45 天 → 180 天，Vega 约增加 2 倍',
          '短期期权对 IV 变化不敏感（Vega 小）：短 DTE 主要风险是 Gamma，不是 Vega',
          '长期期权对 IV 变化极敏感：LEAPS 主要风险是 Vega，不是 Gamma',
          '日历价差（Long far - Short near）：净正 Vega，IV 上升时受益',
        ],
      },
      {
        title: 'Vega 在策略中的应用',
        content: [
          'Long Vega 策略：Long Call/Put，Long Straddle，Calendar Spread — 低 IV 时建立',
          'Short Vega 策略：Iron Condor，Short Strangle，Short Straddle — 高 IV 时建立',
          'IV Rank 决策：IV Rank > 50 → Short Vega；IV Rank < 25 → Long Vega',
          'Vega 交易核心理念：当 IV（隐含波动率）> HV（历史实现波动率）时，卖方有优势',
          'Term Structure（期限结构）套利：当近月 IV > 远月 IV 时，买远月卖近月',
        ],
      },
    ],
    keyRules: [
      { rule: 'Long 期权 → 正 Vega（做多 IV）', color: '#10d984' },
      { rule: 'Short 期权 → 负 Vega（做空 IV）', color: '#f25656' },
      { rule: 'ATM 期权 Vega 最大', color: '#9b6ef3' },
      { rule: '长 DTE Vega 更大', color: '#3b82f6' },
      { rule: '低 IV 时买 Vega，高 IV 时卖 Vega', color: '#f5a623' },
    ],
  },
  {
    symbol: 'ρ',
    name: 'Rho',
    zh: '利率敏感性',
    color: '#06d6da',
    tagline: '利率变化 1%，期权价值变化多少？',
    oneliner: 'Rho 在大多数短期期权中影响较小，但在 LEAPS 和高利率环境中不可忽视。',
    sections: [
      {
        title: '基本定义',
        content: [
          'Rho = ∂V / ∂r（期权价值对无风险利率的偏导数）',
          '通常表示利率变化 1% 时期权价格的变化（单位：$/1% 利率）',
          'Call Rho：正值（利率上升时 Call 价值增加）',
          'Put Rho：负值（利率上升时 Put 价值减少）',
          'DTE 越长，Rho 越大（利率对折现影响更显著）',
        ],
      },
      {
        title: '利率影响期权价格的机制',
        content: [
          'Call：更高的利率 → 持有正股的机会成本增加 → Call（替代品）更有价值',
          'Put：更高的利率 → 卖出股票持有现金更有吸引力，降低对 Put 的需求 → Put 价值下降',
          '现金担保 Put（CSP）：高利率时，持有现金等待被行权收益更高',
          '高利率环境（如 2022-2024）：LEAPS Call 比低利率时更贵，LEAPS Put 更便宜',
        ],
      },
      {
        title: 'Rho 的实际规模',
        content: [
          '短期期权（< 60 DTE）：Rho 通常 < $1，对日常交易影响可忽略',
          'LEAPS（1-2 年）：Rho 可达 $5-20，利率变化 1% 影响显著',
          '2022 年加息周期：长期期权价格受 Rho 影响明显，需要调整定价模型',
          'Synthetic 策略：Synthetic Long = Long Call + Short Put（零 Vega 但有 Rho）',
        ],
      },
      {
        title: 'Rho 在策略中的应用',
        content: [
          'LEAPS 策略必须考虑 Rho：利率上升有利于 LEAPS Call，不利于 LEAPS Put',
          'Jelly Roll 套利：通过合成头寸纯套利利率差异，Rho 是主要收益来源',
          'CSP vs 买股：高利率时持有现金做 CSP 的机会成本更低（有利于 CSP）',
          '大多数日常期权策略：Rho 可以忽略，专注于 Delta/Gamma/Theta/Vega',
        ],
      },
    ],
    keyRules: [
      { rule: 'Long Call → 正 Rho', color: '#10d984' },
      { rule: 'Long Put → 负 Rho', color: '#f25656' },
      { rule: 'DTE 越长，Rho 越大', color: '#06d6da' },
      { rule: 'LEAPS 必须考虑 Rho', color: '#f5a623' },
      { rule: '短期期权 Rho 可忽略', color: '#555e73' },
    ],
  },
];

export const GREEKS_INTERACTIONS = [
  {
    title: 'Gamma vs Theta：最根本的权衡',
    color: '#f5a623',
    icon: '⚖️',
    content: `这是期权定价的核心矛盾，也是期权买卖方博弈的本质：

**正 Gamma（期权买方）：**
- 好处：价格大幅移动时获益（凸性）
- 代价：每天支付 Theta（时间价值损耗）

**负 Gamma（期权卖方）：**
- 好处：每天收取 Theta（时间价值收入）
- 代价：价格大幅移动时亏损加速

**数学关系（Black-Scholes PDE 的核心）：**
Theta ≈ -½ × Gamma × S² × σ²

这意味着：Gamma 和 Theta 永远是相反的！你不能既有正 Gamma 又有正 Theta（除非考虑利率效应）。

**实践意义：**
- 低 IV 市场：Theta 便宜 → 买 Gamma（Long Straddle 性价比高）
- 高 IV 市场：Theta 贵 → 卖 Gamma（Iron Condor 性价比高）
- 判断依据：IV > HV → 市场"高估"波动率 → 卖方有统计优势`,
  },
  {
    title: 'Vega vs Theta：时间价值的两个维度',
    color: '#3b82f6',
    icon: '📊',
    content: `Vega 和 Theta 都来自"时间价值"，但衡量的是不同的风险维度：

**时间价值的两个组成部分：**
- Theta 衰减：仅仅因为时间流逝而损失的价值
- Vega 敞口：因 IV 变化而变化的价值

**IV 和时间价值的关系：**
时间价值 ≈ S × IV × √(DTE/365) × 常数
→ IV 越高，时间价值越大，Theta 和 Vega 都越大

**实践含义：**
| 情景 | Theta 变化 | Vega 变化 |
|---|---|---|
| IV 上升 | Theta 绝对值增大 | Vega 价值增大（Long Vega 盈利）|
| IV 下降 | Theta 绝对值减小 | Vega 价值减小（Short Vega 盈利）|
| 时间流逝 | Theta 加速 | Vega 减少（DTE 缩短）|

**策略含义：**
- Short Vega + Positive Theta = 期权卖方的核心组合（Iron Condor 等）
- Long Vega + Negative Theta = 期权买方的核心组合（Long Straddle 等）
- 两者必须取舍：没有既收 Theta 又赚 Vega 的"免费午餐"`,
  },
  {
    title: 'Delta vs Gamma：方向与加速度',
    color: '#10d984',
    icon: '🎯',
    content: `Delta 和 Gamma 的关系就像物理学中的速度和加速度：

**Delta = 方向（速度）**
- 当前 Delta 告诉你仓位现在的方向敏感性
- Delta=0.50 的 Long Call：标的涨 $1，期权涨约 $0.50

**Gamma = Delta 的变化率（加速度）**
- Gamma 告诉你随着标的价格移动，Delta 如何变化
- Gamma=0.05：标的涨 $1，Delta 增加 0.05（从 0.50 变成 0.55）

**直觉理解：**
- 正 Gamma 头寸：方向正确时加速赚钱，方向错误时减速亏钱 → 有利
- 负 Gamma 头寸：方向正确时减速赚钱，方向错误时加速亏钱 → 不利

**ATM 期权的特殊性：**
- Gamma 在 ATM 最大：Delta 在此处变化最快
- 这就是为什么 ATM Short Straddle 风险最大：一旦标的移动，Delta 快速积累

**Gamma Hedging：**
专业交易者不只是 Delta Hedge，还要管理组合的 Gamma：
- Gamma 中性：不仅消除方向性，还消除方向性的加速度
- 需要用不同行权价的期权来构建 Gamma 中性组合`,
  },
  {
    title: 'Vega 与 DTE：时间越长，IV 影响越大',
    color: '#9b6ef3',
    icon: '📅',
    content: `Vega 与到期时间（DTE）的关系是非常重要的实践知识：

**数学关系：**
Vega ∝ √T（Vega 与时间平方根成正比）

**具体数字感知（ATM Call，IV=30%，S=100）：**
- 7 DTE：Vega ≈ $0.8
- 30 DTE：Vega ≈ $1.7
- 45 DTE：Vega ≈ $2.1
- 90 DTE：Vega ≈ $2.9
- 365 DTE：Vega ≈ $6.0

**实践应用：**

做多 Vega（买方）：
→ 用更长 DTE 期权（90+ 天），每单位成本获得更多 Vega 敞口
→ IV Rank 低时建仓，等待 IV 回升

做空 Vega（卖方）：
→ 用中等 DTE（30-45 天），Vega 适中但 Theta 效率高
→ 避免太长 DTE（Vega 太大，IV 风险过高）

日历价差（Calendar）：
→ 远月 Vega 大 + 近月 Vega 小 = 净 Long Vega
→ 期限结构正斜率（近月 IV > 远月 IV）时最有利

**总结口诀：**
"短 DTE 管 Gamma，长 DTE 管 Vega"`,
  },
  {
    title: '综合 Greeks 矩阵：一眼判断策略属性',
    color: '#f97316',
    icon: '📋',
    content: `每个策略都有自己的 Greeks 组合，理解这个矩阵帮你快速判断风险来源：

| 策略 | Delta | Gamma | Theta | Vega |
|---|---|---|---|---|
| Long Call | + | + | − | + |
| Short Call | − | − | + | − |
| Long Put | − | + | − | + |
| Short Put | + | − | + | − |
| Long Straddle | ≈0 | + | − | + |
| Short Straddle | ≈0 | − | + | − |
| Iron Condor | ≈0 | − | + | − |
| Bull Call Spread | + | 小 | ± | 小 |
| Long Calendar | ≈0 | 小 | + | + |
| Long Butterfly | ≈0 | 小 | + | 小 |

**关键规律：**
1. Long 任何期权 → 正 Gamma + 正 Vega + 负 Theta（永远成立）
2. Short 任何期权 → 负 Gamma + 负 Vega + 正 Theta（永远成立）
3. Gamma 和 Theta 永远符号相反
4. Long 期权的 Vega 和 Gamma 永远同号（正）
5. 多腿组合的 Greeks 是各腿之和

**使用方法：**
开仓前问自己：
- 我的 Delta 敞口是多少？（方向判断对不对？）
- 我的 Gamma 风险在哪里？（哪种移动最危险？）
- 我每天 Theta 收支是多少？（时间是我的朋友还是敌人？）
- 我的 Vega 怎么样？（IV 变化时我赚还是亏？）`,
  },
  {
    title: 'GEX & 做市商对冲机制',
    color: '#9b6ef3',
    icon: '🏦',
    content: `**做市商（Market Maker）的处境**

做市商是期权的主要对手方：散户/机构买 Call/Put，做市商就是卖方。
做市商通常 Short Gamma（负 Gamma）：标的大幅移动对他们不利。
他们通过持续 Delta 对冲来管理风险，这个对冲行为影响整个市场。

**GEX 公式**
GEX = Σ (Gamma × OI × 合约规模 × 标的价格)
正号 = 做市商 Long Gamma；负号 = 做市商 Short Gamma

**GEX 对市场的影响**

| GEX 状态 | 做市商行为 | 市场表现 |
|---|---|---|
| **正 GEX** | 涨 → 卖股；跌 → 买股 | 波动被抑制，VIX 低，趋势弱 |
| **负 GEX** | 涨 → 买股；跌 → 卖股 | 波动被放大，VIX 高，趋势强 |
| **Gamma Flip** | GEX = 0 的价格水平 | 突破后进入"自由波动"模式 |

**实践应用**
- 在正 GEX 区域：适合卖方策略（Iron Condor），波动率被天然压制
- 在负 GEX 区域：卖方策略危险，方向性动能更强
- Gamma Flip 水平附近：往往是关键阻力/支撑，可作为止损参考
- 月度 OpEx 临近：GEX 急剧变化，市场行为往往异常`,
  },
  {
    title: 'Gamma Squeeze 实战案例',
    color: '#f25656',
    icon: '🚀',
    content: `**什么是 Gamma Squeeze**

当大量期权被买入 → 做市商被迫买入大量正股对冲（负 Gamma 状态）→ 正股上涨 → 做市商再买更多 → 正反馈螺旋。
Gamma Squeeze 通常叠加 Short Squeeze 效果最猛。

**案例一：GME 2021年1月（最典型）**
背景：GME 被做空 > 140%，WallStreetBets 发现并大量买入 OTM Call
机制：
- 大量 OTM Call 被买入 → 做市商 Short 大量 Call（Short Gamma）
- GME 小涨 → 做市商被迫买正股对冲 Delta
- 买股行为导致继续上涨 → 做市商再买更多 → 螺旋上升
- 同时空头被迫回购（Short Squeeze 叠加）
结果：GME 从 $17 → $483（+2700%）在约 2 周内

**案例二：TSLA 2020年 Q3**
背景：SoftBank 秘密购买 ~$40 亿名义价值的 TSLA Call 期权
机制：做市商被迫大量买入 TSLA 股票对冲
结果：TSLA 从 $200 → $500（复权），正好在纳入标普 500 前
事后 SoftBank 被称为"纳斯达克鲸鱼"

**案例三：Volmageddon 2018年2月5日（Vega Squeeze）**
背景：大量散户做多 XIV（做空 VIX 的 ETP）
机制：
- 2018年2月5日 VIX 突然大涨
- XIV 产品必须买入 VIX 期货再平衡
- 买 VIX 期货 → VIX 再涨 → XIV 再买 → 正反馈
结果：XIV 单日跌 93%，产品直接清算，标普 500 单日跌 4%

**案例四：0DTE Gamma 效应（2023-2024 现代市场）**
- 日到期 SPX/SPY 期权（0DTE）已占总成交量 > 50%
- 每天特定时段形成极端 Gamma 集中
- 突破特定价位时会触发爆炸性移动（通常在 2-3pm EST）
- 做市商在 0DTE 中 Gamma 对冲频率极高，是当前市场内日波动的主要驱动

**交易启示**
- 注意期权 OI 高度集中的行权价：这些是 Gamma Squeeze 的引爆点
- 异常的 Call 成交量 + 高 OI 堆积 = Gamma Squeeze 预警信号
- 永远不要在 Gamma Squeeze 行情中裸卖 Call`,
  },
  {
    title: 'Vanna & Charm：二阶希腊字母',
    color: '#06d6da',
    icon: '∂²',
    content: `**什么是二阶 Greeks**

除了五大 Greeks，还有几个"二阶"Greeks 对理解市场流动至关重要，尤其是做市商的对冲行为。

**Vanna = ∂Delta/∂σ = ∂Vega/∂S**
Delta 对 IV 的敏感度，也是 Vega 对标的价格的敏感度

- IV 下降（如财报后 IV Crush）→ OTM Call 的 Delta 下降
  → 做市商持有的 Long Delta 头寸变小
  → 做市商被迫卖出正股
  → 这就是为什么财报即使超预期，股价有时仍会下跌

- IV 上升 → OTM Call 的 Delta 上升 → 做市商需要买入更多股票
  → VIX Spike 时往往会看到个股异常上涨（Vanna 流动）

Vanna 实战：VIX Spike 期间全市场 Vanna 流动导致相关性突然飙升（股票之间同涨同跌）

**Charm = ∂Delta/∂t**
Delta 随时间的自然衰减（即使标的不动）

- OTM 期权随时间流逝，Delta 自然向 0 收缩
- 这导致做市商每天需要微调持股（卖出之前买入的对冲股票）
- Charm 流动在 OpEx 前一天（周四）最大：解释了周四经常有特殊价格行为
- 方向：Call 的 Charm 为负（Delta 随时间减小），Put 的 Charm 为正

**Volga/Vomma = ∂Vega/∂σ**
Vega 对 IV 变化的敏感度（Vega 的 Gamma）

- 衡量 IV 大幅变化时 Vega 的非线性变化
- OTM 期权的 Volga 高：IV 从 30% 到 50%，OTM 期权的 Vega 增幅更大
- 这是为什么在 VIX Spike 时 OTM Put 涨幅往往超过 ATM Put

**Speed = ∂Gamma/∂S**
Gamma 对标的价格的敏感度（Gamma 的 Delta）
- 衡量价格移动时 Gamma 变化多快
- 在 0DTE 和深 ATM 期权中最重要`,
  },
  {
    title: 'OpEx Pin Risk & 期权到期效应',
    color: '#f97316',
    icon: '📌',
    content: `**Pin Risk（固定风险）**

到期日临近时，大量 OI 集中的行权价会产生"磁力"效应，价格往往被"钉"在这些水平附近。

机制：
- 如果 SPY 接近 $450 Call（OI 极大），标的微涨 → 做市商 Delta 增加 → 卖出股票 → 价格回到 $450
- 这种双向对冲在高 OI 行权价附近形成持续的"橡皮筋"效应

**Max Pain 理论**
最大痛苦价格 = 使期权买家亏损总额最大的价格
= Σ (Put_OI × max(K-S, 0) + Call_OI × max(S-K, 0)) 最小化时的 S

- 不是精确预测工具，但统计上有 1-2% 的引力效应
- 月度/季度 OpEx 时效果更明显（机构大量持有 SPX 期权）

**每月 OpEx 规律（第三个周五）**

| 时间 | 现象 | 原因 |
|---|---|---|
| OpEx 前 1-2 周 | IV 往往上升 | 机构买保险期权需求增加 |
| OpEx 前周四 | 大幅波动 | 大量头寸平仓 + Charm 流动最大 |
| OpEx 当天 | 价格向高 OI 行权价靠拢 | Pin Risk + Max Pain 效应 |
| OpEx 后 | IV 往往下降 | 对冲需求消失，Vega 被卖出 |

**年度 OpEx 日历（重点）**
- 3月/6月/9月/12月 季度 OpEx：最大规模，机构大量解除对冲
- 12月第三周：年度最大 OpEx，常伴随 VIX 大幅变动
- 1月：新年效应 + 机构建仓，IV 往往从低位回升

**实战：如何利用 OpEx 效应**
- OpEx 前 2 周：IV 上升适合卖方开仓（先收 IV 溢价）
- OpEx 当周：避免跨越高 OI 行权价的方向性赌注
- OpEx 后：如果 IV 下跌显著，可以考虑 Long Vega 建仓`,
  },
  {
    title: 'Vol Skew & Smile：波动率曲面',
    color: '#f5a623',
    icon: '📈',
    content: `**什么是 Vol Skew**

Black-Scholes 假设 IV 对所有行权价相同，但现实中不同行权价的 IV 不同，形成"波动率斜面"。

**典型形态：看跌偏斜（Put Skew）**
- OTM Put 的 IV > ATM IV > OTM Call 的 IV
- 原因：市场对下跌的恐惧 > 对上涨的贪婪
- 机构大量买 OTM Put 作为保险 → 推高 Put 的 IV
- 结果：Put 比 BS 理论更贵，OTM Call 比 BS 理论更便宜

**25-Delta Skew（最常用指标）**
Skew = IV(25D Put) - IV(25D Call)
- 正常市场：Skew = 3-6%（Put 比 Call 贵）
- Skew 变陡 = 市场避险情绪上升（机构在买保险）
- Skew 变平 = 市场出现 Call 需求（看涨情绪 or Gamma Squeeze 预警）

**Call Skew 逆转：Gamma Squeeze 预警**
- 正常：Put Skew 向左倾斜
- Gamma Squeeze 前兆：OTM Call IV 超过 ATM IV（Call Skew 出现）
- GME 2021 年1月：OTM Call IV 远超 Put IV，这本身就是信号

**Vol Term Structure（期限结构）**

| 状态 | 含义 | 交易含义 |
|---|---|---|
| 正常斜率（远月 > 近月）| 长期不确定性溢价 | 做多近月/空远月 = 负 Carry |
| 倒置（近月 > 远月）| 预期近期有重大事件 | 近月 IV 高 → 卖近月 |
| 极度倒置 | 市场恐慌（VIX Spike）| 均值回归机会，卖方入场时机 |

**VIX 与个股 IV 的关系**
- VIX = SPX 30日 IV 的市场隐含预期（加权公式，非 BS）
- VIX 与 SPX 相关性约 -0.7（股市跌，VIX 涨）
- VIX > 30：历史上是卖方绝佳入场时机（均值回归到 15-20）
- VIX < 12：市场极度乐观，买 Vega 性价比高

**实战应用**
- 卖 OTM Put：利用 Put Skew 溢价（Put 比 BS 贵，卖方有额外优势）
- Put Spread vs Naked Put：用 OTM Call 的便宜来构建 Risk Reversal
- 日历价差：利用期限结构 → 卖贵的近月 IV，买便宜的远月 IV`,
  },
  {
    title: '期权卖方系统化框架（Vol Risk Premium）',
    color: '#10d984',
    icon: '💰',
    content: `**核心 Edge：波动率风险溢价（Vol Risk Premium）**

IV 长期系统性高于实际波动率（RV），这个差值就是卖方的统计优势：
SPY 历史数据：30日 IV 均值 ≈ 16%，30日 RV 均值 ≈ 13%，差值 ≈ 3%

这不是运气，是有学术研究支撑的、持续存在的 market inefficiency。

**两种哲学对比**

| 维度 | 卖方（Premium Seller）| 买方（Premium Buyer）|
|---|---|---|
| 胜率 | 70-90% | 30-40% |
| 单次盈亏 | 小赢 / 偶尔大亏 | 频繁小亏 / 偶尔大赢 |
| Edge 来源 | Vol Risk Premium（统计）| 方向判断（技术/基本面）|
| 核心风险 | 黑天鹅、尾部风险 | IV Crush、时间损耗 |
| 适合场景 | 高 IV，震荡市 | 低 IV，有明确 Catalyst |

**Tastytrade 系统（回测最完善的散户框架）**

开仓过滤：
- IVR > 50（IV 相对高位，均值回归预期）
- 流动性：OI > 1000，bid-ask < 标的价 0.5%

开仓参数：
- DTE = 45 天（Theta 衰减效率最高的区间）
- 短腿 Delta = 0.16-0.30（POP 70-84%）
- 用 defined-risk 结构（避免黑天鹅）

持仓管理（机械执行）：
- 盈利 50% → 平仓（不贪等 100%，数学上 75% 概率更优）
- 亏损 200% 权利金 → 止损（砍掉 tail risk）
- DTE < 21 → 考虑 roll 或平仓（避免 Gamma 爆炸）

规模管理：
- 单标的 ≤ 5% 资金
- 15-20 个不相关标的同时持有（分散 Vega 风险）
- 整体 Delta 保持接近中性

**常见死法**

| 死法 | 原因 | 解法 |
|---|---|---|
| IV Crush 买方 | 财报前买期权，事后 IV 暴跌 | 看 IVR，高 IV 不买方 |
| 裸卖被黑天鹅 | Naked Put/Call 遇极端行情 | 永远用 defined-risk |
| 仓位集中 | 5个相关标的同方向 | 分散，控制 portfolio Greeks |
| 不止损 | 亏 300% 还在等反弹 | 机械执行 2x 权利金止损 |
| Gamma 爆炸 | DTE < 7 还持仓 | 21天内 roll 或平仓 |`,
  },
  {
    title: '实战决策框架：用 Greeks 做交易决定',
    color: '#10d984',
    icon: '🧭',
    content: `将 Greeks 转化为实际交易决策的完整框架：

**Step 1：判断市场状态**
- 查 IV Rank/Percentile → 决定做多还是做空 Vega
- 看 HV vs IV → IV > HV 时卖方有统计优势
- 判断趋势 → 确定 Delta 方向偏向

**Step 2：根据市场状态选择策略**
- 低 IV + 有方向：Long Call/Put 或 Spread
- 低 IV + 无方向：Long Straddle/Strangle
- 高 IV + 有方向：Credit Spread（Bull Put / Bear Call）
- 高 IV + 无方向：Iron Condor / Short Strangle

**Step 3：根据 Greeks 优化参数**
- 行权价：ATM（最大 Gamma/Theta），OTM（更大缓冲）
- DTE：短 DTE（Theta 效率高），长 DTE（Vega 更大）
- 宽度：更宽的价差 = 更多信用但更大最大亏损

**Step 4：持仓期间监控**
- 每日检查 Delta：是否偏离太多？是否需要 Delta Hedge？
- 每周检查 Vega：IV 有没有大变化？
- DTE 检查：< 21 DTE 时重新评估是否继续持有

**Step 5：退出决策**
- Theta 策略：收取信用 50% 时平仓（不贪心等归零）
- Long Gamma：目标实现（大幅移动）或时间损耗 50% 时平仓
- 止损：任何策略亏损 2× 初始信用或 50% 权利金时执行`,
  },
];
