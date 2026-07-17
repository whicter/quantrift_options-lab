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
    oneliner: 'Gamma 描述标的价格变化时 Delta 的变化速度；它需要与 Theta、波动路径和交易成本一起评估。',
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
          '正 Gamma 的表现还取决于实际波动是否覆盖时间价值、交易成本与再平衡成本',
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
          'GEX 是基于 Gamma、OI、合约乘数和现价估算的 Delta-dollar 敏感度；本产品单位为标的变动 1% 时的模型估算值',
          'Call 正号 / Put 负号是 dealer positioning 代理假设，公开 OI 无法确认真实做市商持仓',
          '正 GEX 模型状态：在代理假设成立时，波动可能更容易收敛；负 GEX 模型状态则可能更容易放大波动',
          'Gamma Flip 是模型净 GEX 穿越 0 的价格阈值，不是确定性支撑、阻力或突破信号',
          '高 OI 行权价处可能形成模型观察位；它不等于确定支撑、阻力或 Pin Risk 结论',
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
    oneliner: 'Theta 是在其他输入不变的模型假设下，时间减少一天时组合理论价值的近似变化。',
    sections: [
      {
        title: '基本定义',
        content: [
          'Theta = ∂V / ∂t（期权价值对时间的偏导数，通常为每日变化）',
          '单腿 Long 期权通常为负 Theta，单腿 Short 期权通常为正 Theta；多腿组合需合并计算',
          'Theta 不是每日固定的现金流，会随价格、IV、利率和到期日变化',
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
          '30 DTE 附近常被用于比较 Theta 与 Gamma 的敏感度；不存在对所有策略都最优的“甜蜜区”',
          '周末/假期：Theta 仍在计算但市场不交易（通常周五 Theta × 3 计入）',
        ],
      },
      {
        title: 'Theta 与 IV 的关系',
        content: [
          'IV 越高，期权时间价值越大，Theta 绝对值越大',
          '高 IV 往往伴随更高绝对 Theta，但同时也可能携带更高 Vega 与尾部风险；这不是收益保证',
          '事件前后 IV 和 Theta 可能显著重估，具体变化取决于报价、标的路径与到期日',
          'Theta/Vega 比率：衡量每单位 Vega 风险换取多少 Theta 收益',
        ],
      },
      {
        title: 'Theta 在策略中的应用',
        content: [
          'Theta 正策略（卖方）：Covered Call，CSP，Iron Condor，Short Straddle',
          'Theta 负策略（买方）：Long Call/Put，Long Straddle，Long Calendar',
          '30-45 DTE 是常见比较区间，不代表 Theta 收益“最高效”',
          '临近到期时 Gamma 敏感度可能提高；是否持有、减仓或滚动取决于结构与风险约束',
          'Theta 是理论敏感度，不能直接外推为每日现金收益',
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
          '财报后 IV 可能显著下降（常称 IV Crush）；这会压低 Long Vega 头寸的模型价值，即使方向判断正确也可能亏损',
          '事件后的 IV 变化需要与实际价格移动、到期日和交易成本一起评估',
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
          'Long Vega 策略：Long Call/Put、Long Straddle、Calendar Spread；是否适合取决于预期波动、价格路径和成本',
          'Short Vega 策略：Iron Condor、Short Strangle、Short Straddle；需定义风险、保证金和尾部风险管理',
          'IV Rank 是相对自身历史区间的描述，不能单独决定做多或做空 Vega',
          'IV 与历史实现波动率的差异是研究输入，不保证任一方向具有优势',
          '期限结构可能为策略提供相对价值线索；实际执行须考虑 bid/ask、流动性和事件风险',
        ],
      },
    ],
    keyRules: [
      { rule: 'Long 期权 → 正 Vega（做多 IV）', color: '#10d984' },
      { rule: 'Short 期权 → 负 Vega（做空 IV）', color: '#f25656' },
      { rule: 'ATM 期权 Vega 最大', color: '#9b6ef3' },
      { rule: '长 DTE Vega 更大', color: '#3b82f6' },
      { rule: 'IV Rank 仅描述相对历史位置，不是单独的交易规则', color: '#f5a623' },
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

做市商、客户、机构和套利参与者的净头寸无法由公开 OI 直接观察。部分 GEX 模型会为 Call 与 Put 赋予代理符号，试图描述潜在的对冲环境；它不等同于已确认的做市商实际仓位。

**GEX 公式与限制**
GEX = Σ (Gamma × OI × 合约规模 × Spot² × 0.01)
这里的 0.01 表示标的变动 1%。Call/Put 的符号来自 dealer positioning 代理假设；公开 OI 不能确认做市商实际持仓方向。

**GEX 对市场的影响**

| GEX 状态 | 做市商行为 | 市场表现 |
|---|---|---|
| **正 GEX 模型状态** | 代理模型下可能对应反向对冲 | 波动可能更容易收敛 |
| **负 GEX 模型状态** | 代理模型下可能对应顺向对冲 | 波动可能更容易放大 |
| **Gamma Flip** | 模型 GEX = 0 的价格阈值 | 可能对应波动环境变化，不是确定性信号 |

**实践应用**
- 正/负 GEX 模型状态可作为研究中的波动环境输入；不单独决定任何策略是否适合
- 卖方、买方或方向性结构都仍需评估价格路径、流动性、事件、保证金与最大风险
- Gamma Flip 水平附近：可作为模型观察位，不应直接当作阻力、支撑或止损位
- 月度 OpEx 临近：GEX 急剧变化，市场行为往往异常`,
  },
  {
    title: 'Gamma Squeeze 实战案例',
    color: '#f25656',
    icon: '🚀',
    content: `**什么是 Gamma Squeeze**

大量 Call 需求、对冲活动、空头回补和流动性变化可能共同形成快速上涨；公开 OI 或成交量本身不能确认任何单一参与者的对冲方向或因果链。

**案例一：GME 2021年1月（最典型）**
背景：GME 被做空 > 140%，WallStreetBets 发现并大量买入 OTM Call
机制：
- OTM Call 需求、标的上涨和空头回补在同一阶段出现
- 对冲需求可能是解释之一，但无法仅凭公开数据确认其规模或方向
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
- 每天可能出现集中到期的 Gamma 暴露
- 模型观察位附近的价格行为需要结合成交、流动性与事件判断，不能假设必然触发加速
- 0DTE 是内日市场结构的一个输入，不能单独证明价格波动原因

**交易启示**
- 注意期权 OI 高度集中的行权价：它们是值得复核的模型观察位
- 异常 Call 成交量与高 OI 需要结合成交方向、开平仓、流动性与价格行为复核
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

到期日临近时，OI 集中的行权价可能成为值得观察的定位区域，但 OI 无法直接识别持仓方、对冲行为或价格因果。

**Max Pain（简化 OI 快照指标）**
最大痛苦价格 = 在简化 OI 快照下，使到期内在价值总额最小的价格
= Σ (Put_OI × max(K-S, 0) + Call_OI × max(S-K, 0)) 最小化时的 S

- 它不包含建仓成本、盘中新交易、平仓或真实持仓方，不是价格预测工具
- 不应将 Max Pain 或高 OI 行权价当作确定目标、支撑或阻力

**每月 OpEx 规律（第三个周五）**

| 时间 | 现象 | 原因 |
|---|---|---|
| OpEx 前 1-2 周 | IV 可能变化 | 事件、对冲与期限结构共同影响 |
| OpEx 前周四 | 波动可能放大 | 持仓调整和市场消息可能同时出现 |
| OpEx 当天 | 价格可能接近高 OI 行权价 | 观察现象不等于因果或目标价 |
| OpEx 后 | IV 可能重估 | 新仓位、事件与对冲均会影响结果 |

**年度 OpEx 日历（重点）**
- 3月/6月/9月/12月 季度 OpEx：最大规模，机构大量解除对冲
- 12月第三周：年度最大 OpEx，常伴随 VIX 大幅变动
- 1月：新年效应 + 机构建仓，IV 往往从低位回升

**研究提示**
- 将到期日、OI 集中度、流动性和事件日作为复核项；不要把 OI 或 Max Pain 单独作为开仓触发器。`,
  },
  {
    title: 'Vol Skew & Smile：波动率曲面',
    color: '#f5a623',
    icon: '📈',
    content: `**什么是 Vol Skew**

Black-Scholes 假设 IV 对所有行权价相同，但现实中不同行权价的 IV 不同，形成"波动率斜面"。

**典型形态：看跌偏斜（Put Skew）**
- OTM Put 的 IV > ATM IV > OTM Call 的 IV
- 常见解释包括下行尾部风险需求、对冲需求与供需差异；单一原因无法由 IV 曲线直接确认
- Put IV 与 Call IV 的相对高低是市场报价特征，不直接证明机构持仓或方向

**25-Delta Skew（最常用指标）**
Skew = IV(25D Put) - IV(25D Call)
- 正常市场：Skew = 3-6%（Put 比 Call 贵）
- Skew 变陡或变平可作为报价结构变化记录；还需要期限、成交、OI 与事件背景才能解释

**Call Skew 变化：需进一步核验**
- 正常：Put Skew 向左倾斜
- OTM Call IV 上升可能反映需求或预期变化，但不是 Gamma squeeze 的充分或必要条件

**Vol Term Structure（期限结构）**

| 状态 | 含义 | 交易含义 |
|---|---|---|
| 正常斜率（远月 > 近月）| 长期不确定性溢价 | 做多近月/空远月 = 负 Carry |
| 倒置（近月 > 远月）| 近期事件或不确定性可能被计价 | 比较事件风险与跨期限报价，不直接推出交易方向 |
| 极度倒置 | 近月风险定价较高 | 需检查催化剂、流动性与尾部风险 |

**VIX 与个股 IV 的关系**
- VIX = SPX 30日 IV 的市场隐含预期（加权公式，非 BS）
- VIX 与 SPX 相关性约 -0.7（股市跌，VIX 涨）
- VIX 水平可作为波动环境背景变量，不能单独构成卖方或买方入场依据

**研究应用**
- 将 skew 与期限结构用于比较不同结构的风险暴露、流动性和事件敏感度；不把单个 skew 水平视为收益保证。`,
  },
  {
    title: '期权卖方系统化框架（Vol Risk Premium）',
    color: '#10d984',
    icon: '💰',
    content: `**核心 Edge：波动率风险溢价（Vol Risk Premium）**

在部分标的、期限和历史样本中，IV 会高于后续 RV；这种差异常被称为波动率风险溢价。它会随市场状态、事件、成本和尾部风险变化，不是保证可以获取的收益。

SPY 的某段历史中 30 日 IV 均值可能高于 30 日 RV 均值；这只是样本描述，不能外推到未来或单笔交易。

**两种哲学对比**

| 维度 | 卖方（Premium Seller）| 买方（Premium Buyer）|
|---|---|---|
| 胜率 | 取决于结构、入场、管理和样本 | 取决于方向、幅度、期限和波动率路径 |
| 单次盈亏 | 可能累积小额权利金，也可能出现大额尾部损失 | 可能持续损耗，也可能在大幅移动时获利 |
| 研究重点 | Vol Risk Premium、尾部风险和成本 | 方向、幅度、期限和波动率风险 |
| 核心风险 | 黑天鹅、尾部风险 | IV Crush、时间损耗 |
| 适合场景 | 需同时核验事件、流动性与最大风险 | 需同时核验成本、事件与可承受损失 |

**规则化研究框架（示例，不构成交易规则）**

开仓过滤：
- IVR > 50（IV 相对历史区间较高；不代表一定均值回归）
- 流动性：OI > 1000，bid-ask < 标的价 0.5%

开仓参数：
- DTE 约 45 天（一个常见研究窗口，仍需考虑事件日和期限结构）
- 短腿 Delta = 0.16-0.30（常见区间，不是 POP 或胜率承诺）
- 用 defined-risk 结构（避免黑天鹅）

持仓管理研究项：
- 可回测不同获利退出点、损失阈值与到期前滚动方案；不存在适用于所有标的和账户的固定最优规则

规模管理：
- 以最大损失、相关性、流动性和账户风险承受能力确定仓位；不要脱离自身约束照搬固定百分比或持仓数量

**常见死法**

| 死法 | 原因 | 解法 |
|---|---|---|
| 事件后 IV 重估 | 财报前后 IV 可能显著变化 | 明确事件风险，比较不同结构与 Vega 暴露 |
| 裸卖被黑天鹅 | Naked Put/Call 遇极端行情 | 永远用 defined-risk |
| 仓位集中 | 5个相关标的同方向 | 分散，控制 portfolio Greeks |
| 缺少退出计划 | 风险超过预设承受范围 | 预先定义、回测并持续复核退出逻辑 |
| 临近到期的 Gamma 风险 | DTE 很低时 Delta 对价格变化更敏感 | 按策略、流动性和组合风险评估减仓、滚动或持有 |`,
  },
  {
    title: '实战决策框架：用 Greeks 做交易决定',
    color: '#10d984',
    icon: '🧭',
    content: `将 Greeks 转化为实际交易决策的完整框架：

**Step 1：描述市场状态**
- 查 IV Rank/Percentile → 记录当前 IV 相对自身历史区间，作为比较 Vega 暴露的一个输入
- 看 HV vs IV → 比较不同窗口和期限的 IV/RV 差异；差异本身不保证卖方或买方结果
- 判断趋势 → 确定 Delta 方向偏向

**Step 2：根据市场状态选择策略**
- 低 IV + 有方向：Long Call/Put 或 Spread
- 低 IV + 无方向：Long Straddle/Strangle
- 高 IV + 有方向：Credit Spread（Bull Put / Bear Call）
- 高 IV + 无方向：Iron Condor / Short Strangle

**Step 3：根据 Greeks 比较参数**
- 行权价：ATM 通常 Gamma/Theta 敏感度更高；OTM 通常离现价更远，但风险并未消失
- DTE：短 DTE 与长 DTE 的 Theta/Vega 敏感度不同，应连同事件风险和流动性一起比较
- 宽度：更宽的价差 = 更多信用但更大最大亏损

**Step 4：持仓期间监控**
- 每日检查 Delta：是否偏离太多？是否需要 Delta Hedge？
- 每周检查 Vega：IV 有没有大变化？
- DTE 检查：< 21 DTE 时重新评估是否继续持有

**Step 5：退出决策**
- 为每个研究方案预先定义可接受损失、时间窗口和事件条件；50% 获利、信用倍数或权利金比例只是可回测的候选规则，不是通用指令。`,
  },
];
