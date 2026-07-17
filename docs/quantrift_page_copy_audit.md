# Quantrift Options Lab 逐页面错误清单

审查对象：`whicter/quantrift_options-lab`
审查基准：`b71c7eff7e0fba9e4c3e1238b995d824c91b5f1a`（2026-07-16 拉取）
审查范围：用户可见页面、导航、状态提示、图表标题、风险文案与 HTML metadata。本文审查的是文案准确性和用户可能形成的理解，不等同于代码安全审计或量化模型验证。

## 等级定义

- **P0 — 阻断上线**：可能让用户误认为演示/研究结果是实时数据、交易动作或权威指标，存在明显财务误导风险。
- **P1 — 上线前修复**：金融概念、指标解释或因果推断不严谨，足以改变交易判断。
- **P2 — 应尽快修复**：功能边界、数据时效、单位或状态表达不清，容易造成误解。
- **P3 — 文案优化**：术语、语言一致性、SEO、可读性或格式问题。

## 先改的 10 项

1. 首页静态行情表不得再写 `LIVE RESEARCH VIEW`。
2. 首页静态表必须标明 `示例数据，不代表当前市场`。
3. Analyze 的 `盘中即时分析` 改为带时间戳的数据快照表述。
4. Scan 的 `真实报价` 改成 `已采集报价快照`，同时展示采集时间。
5. Weekly 的自定义分数不能叫 `情绪指数`，更不能用“恐慌/贪婪”。
6. OBV 不能直接标成 `资金流入/资金流出`。
7. GEX 正负不能无条件等同于做市商 long/short gamma。
8. `IV 高 = 卖方有统计优势`、`IV 低 = 买方有优势`应删除。
9. Put/Call Ratio 不能直接翻译为多空情绪或反弹机会。
10. Portfolio 的 `关闭`必须明确只是归档记录，不是向券商平仓。

## 2026-07-16 Remediation Status

The following status reflects a source-level implementation review after the copy corrections. “Complete” means the repository-controlled page copy/behavior was changed and is covered by the normal frontend build/test pass; it does not claim that a model itself has predictive validity.

| Audit area | Status | Implemented outcome |
|---|---|---|
| Global metadata, language, theme labels, persistent risk disclosure | Complete | `zh-CN`, product title/description, Chinese theme controls, and the research/risk footer are in the app shell. |
| Homepage static preview and product boundary | Complete | Hero is labeled illustrative/non-current; the copy says covered symbols, snapshot candidates and decision support rather than live market/execution. |
| Analyze terminology, GEX, walls, IV, POP, earnings and tabs | Complete | Snapshot/model wording, conditional scenarios, GEX positioning qualification, and POP/earnings limitations replace deterministic or advisory language. |
| Trend, PCR, OBV and external-event interpretation | Complete | OBV is price-volume momentum; PCR describes relative Put/Call measures; event flow shows timestamped external events rather than asserted net flow. |
| Scan labels, score, Gamma, community and strategy language | Complete | Stored quote snapshot, heuristic filter-match score, model positioning, sample-limited community context, and candidate-not-order wording are used. |
| Weekly score, Gamma/Wall/Max Pain/OI and playbook | Complete | The custom score is now a weekly model score; gamma/wall/max-pain and scenarios are framed as model/conditional observations. |
| Learn, payoff export, portfolio and account copy | Complete | Greeks and payoff ranges use model assumptions; exports are annotated; portfolio close is a record-only action; plans use snapshot-frequency wording. |
| GEX unit and positioning-model disclosure | Complete | The calculation uses the 1%-move unit, carries model version/unit metadata, and UI/wiki wording states it is an estimate based on assumptions. |

### Remaining items that are not completed in this pass

1. **Full server rendering / static generation:** an immediately crawlable semantic product summary is in `frontend/index.html`, but the React application is not yet a full SSR/SSG architecture. Moving all routes to SSR/SSG requires a framework and deployment architecture decision; it is a separate code project, not an external credential blocker.
2. **Brand/domain rename:** no repository change can register a domain, transfer a trademark, or rename an externally operated brand. Those require owner/legal/registrar action.
3. **Model validation:** wording, units and provenance are corrected here. Predictive performance, provider coverage and any investment suitability claim require separate data validation and governance work; the UI intentionally does not make such claims.

---

## 全站框架与 SEO

| 位置 | 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---|---:|---|---|
| `frontend/index.html:2` | `<html lang="en">` | P2 | 主界面主要为简体中文，语言标记错误，会影响屏幕阅读器、翻译和搜索索引。 | `<html lang="zh-CN">` |
| `frontend/index.html:7` | `<title>options-lab</title>` | P2 | 使用内部项目名，品牌、产品用途和搜索意图都没有体现。 | `<title>Quantrift — Options Research & Strategy Lab</title>` |
| `frontend/index.html` | 缺少 description | P3 | 搜索结果没有受控摘要。 | `<meta name="description" content="Quantrift combines price trends, options positioning, volatility and defined-risk strategy research in one workflow.">` |
| 全站 | `Dark` / `Light` | P3 | 与中文主界面不一致。 | `深色` / `浅色` |
| 全站 | 多处 `price_history`、`materialized snapshot`、`collector watchlist`、`regular-session 30M bars` | P2 | 将实现细节直接暴露给终端用户；用户无法据此采取行动。 | 分别改为 `价格历史`、`已生成的数据快照`、`数据覆盖列表`、`常规交易时段 30 分钟K线`。技术字段可放进“数据详情”。 |
| 全站 | 没有持续可见的研究/数据风险说明 | P1 | 单句“不构成建议”只出现在局部页面，且页面同时给出“推荐策略、目标、止损”等强行动语言。 | 页脚固定文案：`仅供研究与教育用途，不构成投资建议或交易指令。期权可能导致全部本金损失，裸卖策略的损失可能超过初始收取的权利金。数据可能延迟、不完整或存在计算误差。` |

## `/` 首页

来源：`frontend/src/pages/Home.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `LIVE RESEARCH VIEW` | **P0** | 下方 SPY、QQQ、AAPL、NVDA 行情是写死的 `HERO_PREVIEW_ROWS`，不是实时数据。“LIVE”构成直接误导。 | `ILLUSTRATIVE RESEARCH VIEW` |
| `MARKET SCANNER` + 静态价格 `$642.08`、`$571.42`、`$213.50`、`$164.92` | **P0** | 静态数字看起来与真实 scanner 输出完全一致，且没有“示例”标签。用户可能把过期价格和策略当成当前信号。 | 表格上方加：`示例界面 · 非实时数据`；更好的是删除具体价格，改用 `Ticker A / Sample IV / Example setup`。 |
| `从全市场扫描到具体期权结构` | P1 | 实际扫描池是“已接入数据的标的”，不是全市场；文案夸大数据覆盖。 | `从已覆盖标的的扫描，到具体期权结构` |
| `按 IV、趋势、Gamma 与流动性筛选，并落到真实到期日和策略腿。` | P2 | “真实”没有说明是快照、延迟还是实时；也没有告诉用户策略腿是系统生成候选，不是可成交订单。 | `按 IV、趋势、Gamma 与流动性筛选，并基于已采集的期权链快照生成到期日与策略腿候选。` |
| `Concrete setups` / `analysis to execution` | **P0** | 产品没有券商下单或执行功能；“to execution”暗示能够执行交易。 | `Research-ready setups` / `analysis to decision support` |
| `Loading` | P3 | 中文页面里出现英文状态。 | `加载中` |
| `GEX unavailable` | P3 | 语言不一致。 | `GEX 暂不可用` |
| `把价格趋势与期权仓位变成可核验的研究路径。` | P2 | “可核验”需要同时提供数据源、快照时间、公式和计算口径；目前首页没有这些信息。 | `把价格趋势与期权仓位整理成带数据状态的研究路径。` |

## `/analyze` 标的分析入口

来源：`frontend/src/pages/Analyze.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `盘中即时分析` | **P0** | 页面混合日线、30 分钟线、期权快照和外部 flow；“即时”暗示当前、同步且实时。 | `标的快照分析` |
| `输入标的，查看 GEX 结构、趋势格局、期权信号与筹码位置` | P1 | “筹码”不是此处数据的规范定义；OI、GEX、成交量不能识别持仓者成本或身份。 | `输入标的，查看 GEX 估算、价格趋势、期权链指标与关键价位。` |
| `高IV — 卖方有优势` | **P1** | IV 高不等于期权被高估，也不保证卖方有正期望；需要与实现波动率、期限结构、事件风险和交易成本比较。 | `IV Rank 较高 · 相对自身历史区间` |
| `低IV — 买方有优势` | **P1** | IV 低也可能对应低预期波动，买方仍会损失时间价值。 | `IV Rank 较低 · 相对自身历史区间` |
| `通常 ~1-3min` / `通常 {estimated_wait}` | P2 | 如果后端不能提供有 SLA 依据的估时，这属于无法保证的承诺。 | `数据补全已排队；完成时间取决于数据源和队列状态。` 如保留估时：`预计等待时间：…（仅供参考）` |
| `下次收盘采集后会自动可用` | P2 | 代码中的采集频率和数据源可能并非只在收盘；也不能保证下一次采集成功。 | `成功完成下一次数据采集后即可使用。` |
| `今日概览` | P2 | 若数据为历史或 stale，“今日”不准确。 | `最新概览` |
| `日内变化` | P2 | 该 Tab 实际包含多日趋势、周线和 30M 数据，不只是日内。 | `价格与动量` |
| `数据解读` | P3 | 标签过于泛化，实际内容主要为期权指标。 | `期权结构` |
| `信号追踪` | P2 | 页面展示的是规则生成的关键位与情景，不是历史信号追踪结果。 | `关键价位与情景` |

## `/analyze` → 最新概览

来源：`frontend/src/pages/analyze/Tab1Overview.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `做市商持有long gamma` / `做市商持有short gamma` | **P1** | 从聚合 OI 计算的 GEX 符号依赖模型对 dealer side 的假设；不能直接证明做市商实际净持仓方向。 | `按当前 GEX 模型假设，该快照对应正/负净 Gamma 暴露；实际做市商持仓不可由公开 OI 直接确认。` |
| `做市商减震对冲，价格倾向震荡` | P1 | 这是条件性市场机制，不是由 GEX 单变量确定的结论。 | `在模型假设成立且其他因素不变时，正 Gamma 对冲可能抑制短线波动。` |
| `谁离现价更近，就更容易先被测试` | P1 | “更近”不构成被测试概率；缺少时间窗和历史验证。 | `下列为距离现价最近的两个期权定位价位；距离本身不代表价格一定会触及。` |
| `趋势主导` / `技术与期权共同作用` / `主要来自Gamma壁效应` | **P1** | 仅凭同步指标无法做价格变动的因果归因。 | `当前价格趋势与以下指标同时出现：…；这些指标不能单独识别价格变动原因。` |
| `MFI · 资金流` | P1 | Money Flow Index 是价量动量振荡指标，不是实际资金流。 | `MFI · 价量动量` |
| `策略推荐` / `推荐策略` | P1 | 强建议性措辞与“仅供研究”定位冲突，且个体风险承受能力未知。 | `策略候选` / `模型筛选结果` |
| `POP 82%`（动态） | **P1** | 未在页面披露 POP 的计算模型、输入、报价时点、手续费和提前平仓假设；百分比容易被当成真实胜率。 | `模型估算 POP 82%*`，并紧邻增加：`*基于当前模型与输入，不是实际胜率保证；未必包含滑点、手续费、提前指派和波动率变化。` |
| `Max Credit` | P2 | Credit 应是净信用，不是“最大信用”；且需说明单位是每股还是每份合约。 | `Net Credit（每份合约）` 或按真实单位改为 `Net Credit（每股报价）` |
| `财报在 … 天内，注意 IV Crush 风险` | P2 | IV crush 常见但不必然发生，也可能已被定价。 | `财报临近：隐含波动率可能在事件后显著变化。` |

## `/analyze` → 价格与动量

来源：`frontend/src/pages/analyze/Tab2Trend.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| OBV 状态：`资金流入` / `资金流出` / `资金平衡` | **P1** | OBV 只是根据涨跌日给成交量加减，不能识别资金真实流入或流出。 | `OBV 上行` / `OBV 下行` / `OBV 横向` |
| `成交量明显放大，趋势可信度高` | P1 | 放量不能自动验证趋势，可能是反转、事件或抛售。 | `成交量高于参考水平；需结合价格方向和后续延续性判断。` |
| `缩量，趋势可靠性存疑` | P2 | 缩量在盘整、假期或稳定趋势中含义不同。 | `成交量低于参考水平；信号确认度有限。` |
| `PCR < 0.6：看多拥挤，逆向需谨慎` | P1 | PCR 受标的、期限、保护性 Put、卖出 Put 等影响，不能直接判定拥挤。 | `PCR(OI) 较低，Call OI 相对较多；方向含义需结合成交方向、期限与持仓用途。` |
| `PCR > 1.0：看空拥挤，可能存在反弹机会` | **P1** | 从聚合 PCR 直接推断反弹机会属于未经验证的交易结论。 | `PCR(OI) 较高，Put OI 相对较多；该比率本身不预测反弹。` |
| `Kalman Filter` | P2 | 页面未说明滤波参数，用户无法复核“趋势格局”。 | 标题改为 `模型平滑趋势`；数据详情增加参数、采样周期和最后更新时间。 |

## `/analyze` → 期权结构

来源：`frontend/src/pages/analyze/Tab3Options.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `期权大单异动` | P1 | 列表依据 ΔOI/成交量筛选，不一定是“大单”，也不能判断开仓、平仓或机构身份。 | `期权成交与 OI 异动` |
| 无数据时：`暂无异常大单` | P2 | 数据缺失、阈值未命中和确实没有活动是不同状态。 | `当前快照未检出达到阈值的异动；这不代表市场没有大额交易。` |
| `PCR(OI)…市场情绪偏空/偏多` | P1 | OI 不包含买卖方向，Put 也可能是卖出或对冲。 | `PCR(OI)…Put/Call 未平仓量的相对比例；不直接代表净看多或净看空。` |
| `PCR(Vol)…当日交易偏空/偏多` | P1 | 成交量比率同样不含主动买卖方向和开平仓信息。 | `PCR(Vol)…当日 Put/Call 成交量的相对比例；方向需结合 bid/ask、开平仓和组合腿判断。` |
| `IV ATM > 40：卖方有统计优势` | **P1** | 使用绝对 40% 阈值跨标的比较不合理，也没有证明期权高估。 | `ATM IV 为 40%+；请与该标的历史 IV、实现波动率和事件风险比较。` |
| `IV ATM < 20：买方成本低` | P1 | 低绝对 IV 不等于价格便宜；相对于未来实现波动可能仍然昂贵。 | `ATM IV 低于 20%；低绝对水平不等于期权被低估。` |
| `Sweep / Dark Pool · 实时资金流` | **P0** | “实时”取决于 provider freshness；“资金流”暗示净流向，而页面仅聚合事件和名义金额。 | `Sweep / Dark Pool · 外部事件流`；旁边显示 `数据截至 {timestamp}`。 |
| `期权权利金` 汇总 | P2 | 汇总 premium 没有说明是名义成交额、净流向还是去重口径。 | `匹配事件名义权利金总额`，并提供统计窗口与去重说明。 |
| `Dark Pool $…` | P2 | 金额实为 `darkPoolNotional`，不是净资金流。 | `Dark Pool 匹配事件名义金额` |

## `/analyze` → 关键价位与情景

来源：`frontend/src/pages/analyze/Tab4Signals.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `主力持仓密度 · OI by Strike` | **P1** | OI by strike 无法识别“主力”、持仓主体或净方向。 | `未平仓量分布 · OI by Strike` |
| `上方压力 · Call Wall` / `下方支撑 · Put Wall` | P1 | Wall 是模型定义的观察位，不保证构成阻力或支撑，且 Put/Call wall 可能位于现价另一侧。 | `Call Wall 观察位` / `Put Wall 观察位` |
| `突破 … 确认上攻` | P1 | 单次价格突破不能“确认”上涨，且没有定义收盘、成交量或时间窗口。 | `若价格在设定确认条件下站上 …，观察下一价位 …` |
| `跌破 … 触发加速` | P1 | 跌破不必然导致加速。 | `若价格在设定确认条件下跌破 …，观察波动是否扩大及下一价位 …` |
| `突破前建议观望，勿追高` | P1 | 这是直接交易建议，与免责声明冲突。 | `突破前仍处于 Call Wall 观察位下方；页面不据此给出交易指令。` |
| `今天最该观察的风险点` | P2 | 数据可能不是今天或已 stale。 | `当前数据快照下最接近的模型观察位` |

## `/scan` 扫描器

来源：`frontend/src/pages/Scan.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `扫描真实报价` | **P0** | “真实”不等于实时或可成交；bid/ask 快照可能延迟、陈旧或已变化。 | `扫描已采集的报价快照` |
| `找到 … 个真实报价候选单` | **P0** | 候选腿由快照拼接，不保证组合能按显示价格成交。 | `找到 … 个基于报价快照生成的候选结构` |
| `当前没有能用真实报价组成的完整候选单` | P2 | 同上，并将“无结果”与数据不足混在一起。 | `当前快照未生成满足条件的完整候选结构；可检查数据状态或调整参数。` |
| `保守` / `标准` / `进取` | P1 | 风险标签容易让用户误以为“保守”结构安全；期权仍可能全部亏损。 | `较低 Delta` / `平衡参数` / `较高 Delta`，并明确这些只描述筛选参数，不代表整体风险等级。 |
| `更靠近现价，收益更高` | P1 | 更靠近现价可能提高 credit，但不保证收益更高；风险和被触及概率也会上升。 | `更靠近现价，通常可获得更高权利金，同时承担更高被触及与亏损风险。` |
| `按注大幅波动`（Long Straddle） | P2 | 应同时说明需要波动超过隐含预期和成本。 | `押注到期前的实际波动足以覆盖已支付权利金与波动率变化。` |
| `Short Strangle…押注区间内震荡` | P1 | 未强调两侧潜在巨大/无限风险。 | `卖出 OTM Call 与 Put；上行损失理论上无限，下行损失可能很大，并存在保证金与提前指派风险。` |
| `Jade Lizard…无上行风险` | P1 | credit 覆盖 call spread width 时到期上行侧通常无亏损，但仍有指派、滑点和管理风险。 | `若净信用不少于 Call spread 宽度，则到期损益图上没有上行亏损；仍存在执行、指派、流动性及下行风险。` |
| `机会分` | P2 | 容易被理解为获利概率或质量评级，但实际是多个输入的启发式综合分。 | `筛选匹配分`；tooltip：`用于排序，不代表胜率、预期收益或投资建议。` |
| `高 IV (>50)` | P2 | 实际字段是 IV Rank，不是 IV；两者不能混用。 | `高 IV Rank (>50)` |
| `中 IV` / `低 IV` | P2 | 同上。 | `中 IV Rank` / `低 IV Rank` |
| `Dollar Volume 单位为百万美元` | P2 | 输入框/返回值若实际单位与 API 未强制一致，会导致数量级错误；页面也没有显示输入单位。 | 标签直接写 `最低日成交额（百万美元）`，不要只在帮助文本说明。 |
| `Unknown allowed` | P3 | 中英混排且含义不直观。 | `不限（允许元数据缺失）` |
| `社区热度` | P2 | Reddit mentions/engagement 不等于整体市场“热度”，采样范围应明确。 | `社区样本热度`；tooltip 增加来源、窗口和覆盖范围。 |
| `Email 提醒` / `浏览器 Push` | P2 | 未说明触发频率、延迟、数据条件以及提醒不是交易信号。 | `保存扫描条件并在命中时通知`，附：`提醒可能延迟或遗漏，不应作为下单依据。` |

## `/weekly` 周度复盘框架

来源：`frontend/src/pages/Weekly.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `一周深度复盘` | P2 | 只有 6 根日线即可生成，部分模块可能无 GEX/ΔOI/Max Pain，“深度”在缺数据时夸大完整性。 | `周度市场快照`；全部核心模块 ready 时再显示 `完整周度复盘`。 |
| `至少需要 6 根真实日线` | P2 | “真实”不是数据质量属性；也没有解释为什么是 6 根。 | `至少需要 6 个有效交易日的价格历史，才能计算本周与前一收盘的比较。` |
| `无法读取 … 的真实周复盘数据` | P2 | 将 API 错误、缺数据和计算失败合并为“无法读取”，无法排障。 | `暂时无法生成 … 的周度快照。请查看数据状态或稍后重试。` |
| `交割偏离` | P1 | Max Pain 不等于实际“交割价”，页面也可能在到期前使用最新 close。 | `价格与 Max Pain 距离` |
| `仓位变化` | P2 | ΔOI 是合约未平仓量变化，不是用户组合仓位或资金方向。 | `未平仓量变化` |

## `/weekly` → 本周定调

来源：`frontend/src/pages/weekly/Sec1Tone.jsx`、`server/src/routes/weekly.js`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| 图表端点：`恐慌` / `中性` / `贪婪`，标题 `情绪指数` | **P0** | 后端分数只是 `50 + weekChange × 7 ± gamma adjustment` 的自定义公式，不是 CNN Fear & Greed、CME 指标或经验证的市场情绪指数。 | 标题改为 `周度模型分数`；端点改为 `偏弱 / 中性 / 偏强`；旁边披露：`由周涨跌幅与 Gamma regime 按固定规则合成，不是恐慌贪婪指数。` |
| 组件名 `CMEGauge` | P2 | 虽不是直接用户文案，但强化了与 CME/权威指标混淆的实现风险。 | 重命名为 `WeeklyModelGauge`。 |
| `综合市场状态` | P1 | 分数是单个标的的周涨跌与 GEX，不是“市场”综合状态。 | `标的周度模型状态` |
| `price_history stale` / `price_history {source}` | P3 | 面向用户暴露内部字段。 | `价格历史已延迟 · 数据截至 {date}` / `价格数据：{source} · 截至 {date}` |
| `示例 weekly shell` | P2 | 产品内部术语，不应出现在正式页面。 | `周度价格数据暂不可用` |

## `/weekly` → Gamma 迁徙

来源：`frontend/src/pages/weekly/Sec2Gamma.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `Gamma 结构迁徙` | P3 | “迁徙”可读性较弱，且单快照时不存在变化。 | `Gamma 结构变化`；只有一个快照时改为 `最新 Gamma 结构`。 |
| `Global GEX` | P2 | “Global”可能被理解为全球市场；这里是该标的所覆盖期权链的汇总。 | `Total modeled GEX` / `模型估算总 GEX` |
| `Call Wall` / `Put Wall` / `Gamma Flip` | P1 | 没有解释为模型输出，也没有公式、覆盖到期日和快照时间。 | 分别加 `模型观察位` 标签，并提供 tooltip：计算口径、包含的到期日、spot 与 snapshot timestamp。 |

## `/weekly` → 价格与 Max Pain 距离

来源：`frontend/src/pages/weekly/Sec3Pinning.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `期权交割偏离` | P1 | 最新收盘与 Max Pain 的距离不是“交割偏离”，除非明确针对已到期合约结算价。 | `最新收盘与 Max Pain 的距离` |
| `Latest Close` | P3 | 中文页面语言不一致。 | `最新收盘价` |
| `最新真实 GEX 快照没有 Max Pain` | P2 | Max Pain 通常由 OI 分布计算，不应描述成 GEX 本身的字段。 | `最新期权 OI 快照不足以计算 Max Pain。` |

## `/weekly` → 未平仓量变化

来源：`frontend/src/pages/weekly/Sec4Money.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `期权仓位变化` | P2 | ΔOI 是合约层面的未平仓量变化，不是投资者方向仓位。 | `期权未平仓量变化` |
| `本周合计 ΔOI` | P1 | 若不同日期、到期日或合约集合发生变化，直接求和可能被误解为净新增方向敞口。 | `可比较合约的累计 ΔOI`，并披露匹配和缺失规则。 |
| `异动合约` | P2 | 应说明阈值，否则数量不可解释。 | `达到 ΔOI 阈值的合约数` |

## `/weekly` → 下周条件剧本

来源：`frontend/src/pages/weekly/Sec5Playbook.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| `下周分叉` | P3 | 含义不直观。 | `下周条件情景` |
| `突破 $…` / `跌破 $…` | P2 | 没有定义“突破/跌破”是盘中触及、收盘确认还是持续时间。 | `若日线收盘站上 $…` / `若日线收盘跌破 $…`，或展示模型实际使用的确认条件。 |
| `目标`（在页面数据模型中） | P1 | 强预测语气；该值只是下一观察位。 | 统一使用 `下一观察位`。 |
| `不构成订单` | P3 | 中文不自然，也不足以表达风险边界。 | `这些条件仅用于研究观察，不构成交易指令或投资建议。` |

## `/learn` 策略库

来源：`frontend/src/pages/Learn.jsx`、`frontend/src/data/strategies.js`、相关组件

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| 分类 `收租` | P1 | 将 short premium 描述成“收租”弱化尾部风险、保证金、提前指派和超过信用额的损失。 | `权利金卖方` |
| 分类 `套利` | P1 | 如果策略并非锁定无风险利润，“套利”会误导。 | `相对价值`；只有满足严格无风险/近无风险定义的策略才使用 `套利`。 |
| `当前 P/L`（学习模拟器） | P2 | 这是 Black–Scholes 情景估值，不是券商实际持仓盈亏。 | `模型情景 P/L` |
| `68% 价格区间` | P1 | 需要说明基于对数正态、输入 IV 和约一标准差假设，不是 68% 保证区间。 | `模型一标准差区间（约 68% 假设）`，tooltip 披露模型和输入。 |
| `导出 PNG` | P3 | 功能没错，但导出图应包含参数、时间和“模型估算”水印，否则截图易脱离上下文传播。 | 按钮不必改；在导出图片中增加 `Model estimate · Inputs as of {timestamp} · Educational use only`。 |
| `Theta：每日时间价值损耗。负值为买方，正值为卖方。` | P1 | 多腿组合或深度 ITM/特殊结构不能简单按买卖方概括；Theta 也非每日固定损耗。 | `Theta：在其他输入不变的模型假设下，时间减少一天时组合理论价值的近似变化。` |
| `Gamma：正 Gamma 有利于大幅移动，负 Gamma 相反。` | P2 | 忽略 theta、交易成本、路径、再平衡与持有期限。 | `Gamma：标的价格变化时 Delta 的变化率；正负 Gamma 的盈亏影响需与 Theta、波动路径和持仓管理一起评估。` |

## `/portfolio` 组合持仓

来源：`frontend/src/pages/Portfolio.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| 按钮 `关闭` | **P0** | 后端 DELETE 路由只是将应用内记录关闭/移除；没有券商连接和订单执行。用户可能误以为已平仓。 | `标记为已平仓`；确认框：`这只会更新 Quantrift 中的记录，不会向券商发送订单。` |
| `未实现 P/L` | P1 | 只有所有腿报价完整时显示，但仍需明确基于 mark、报价时间、乘数、数量和手续费。 | `估算未实现 P/L`；tooltip：`基于最新可用 mark，不含手续费、滑点和税费。` |
| `开仓价格` / placeholder `Entry` | P2 | 未说明每股期权报价还是每份合约总额，容易产生 100 倍错误。 | `开仓价（每股报价）` 或与实际后端口径一致的明确单位。 |
| `组合数量` | P2 | 用户不易判断是策略组合份数还是合约张数。 | `策略组合数量`；帮助文字：`每条腿的合约数还会乘以腿数量。` |
| `保存持仓` | P2 | 应说明只是手工记录，非券商同步。 | `保存持仓记录` |
| `组合 Greeks` | P2 | 应说明为模型估算，且报价缺失时不可用。 | `估算组合 Greeks` |

## `/account` 账户与订阅

来源：`frontend/src/pages/Account.jsx`

| 具体原文 | 等级 | 问题 | 推荐替换文案 |
|---|---:|---|---|
| Free：`策略学习与延迟分析。` | P2 | 没有定义延迟多久、哪些数据延迟、是否有扫描额度。 | `策略学习；分析数据可能延迟。具体数据时效与使用限制见方案详情。` |
| Pro：`实时分析、扫描器、提醒与组合持仓。` | **P0** | “实时”必须有明确数据授权、来源、刷新频率和服务边界；目前多个页面本身存在 stale/待接入状态。 | `更高频的数据快照、扫描器、条件提醒与持仓记录。数据频率和覆盖范围因来源而异。` |
| `可用功能 {count}` | P3 | 数量对用户没有意义。 | 直接列出功能名称，或改为 `已启用 {count} 项功能` 并提供展开列表。 |
| 原始订阅状态 `{account.subscription.status}` | P3 | 可能直接显示 `past_due`、`incomplete_expired` 等内部枚举。 | 映射为中文状态，并为欠费/取消提供明确下一步。 |

## 建议统一采用的数据标签

所有分析、扫描和复盘卡片都建议固定显示以下四项，避免反复使用含糊的“真实”“实时”“最新”：

| 字段 | 示例 |
|---|---|
| 数据来源 | `Polygon options snapshot` |
| 快照时间 | `2026-07-16 12:35 PT` |
| 新鲜度 | `延迟约 15 分钟` / `收盘数据` / `实时流` |
| 计算口径 | `GEX model v1 · 0–60 DTE · OI as of prior close` |

页面中的推荐统一改为“候选”或“情景”；预测性动词统一改为条件表达：

- `会反弹` → `若出现反弹，观察…`
- `确认上攻` → `满足确认条件后，观察上行延续性`
- `触发加速` → `观察波动是否扩大`
- `支撑/压力` → `模型观察位`，除非另有经过验证的 S/R 计算
- `真实报价` → `报价快照`
- `实时` → 明确的刷新频率或 `数据截至…`

## 总体结论

当前最大问题不是语法，而是**确定性和权威性过强**：静态 demo 被包装成 live、启发式分数被包装成情绪指数、聚合 OI/GEX 被用来推断做市商持仓和价格因果、快照报价被称为“真实报价”，以及研究记录按钮使用了近似交易执行的措辞。

上线前至少应完成全部 P0 和 P1。P2/P3 可以分批处理，但“数据来源 + 时间戳 + 新鲜度 + 模型口径”最好作为一个全站组件一次性解决，否则每个页面还会继续产生相同的可信度问题。
