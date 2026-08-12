# Gamma Squeeze 捕获层与空头数据（2026-08-11）

目标不是上线一个"挤压信号"，而是**让时间开始为校准工作**。当前任何阈值都是猜的，
唯一能把猜测换成校准的办法，是在需要回答问题时手里已经有样本。

## 一、必须先说破的符号陷阱

`compute_gex.py` 的模型是 `call_gex = +gamma×call_OI`、`put_gex = −gamma×put_OI`，
即"call 正 / put 负"约定，**隐含假设做市商持有多头 call**。

而散户型 gamma squeeze（GME 那种）恰恰相反：散户狂买 call、做市商被迫做空。
**同一份持仓在这个约定下会算出相反的符号。** 代码注释自己写明了这一点：
「公开 OI 并不识别真实做市商头寸」。

**因此本捕获层不以聚合 gamma 符号作为判据。** `gamma_regime` 只作为上下文字段记录，
永不参与过滤（有回归测试锁定：四种 regime 值都必须被捕获）。所有判据字段都是
**可观测的链上事实**，不声称做市商方向。

## 二、一个被自己查错表导致的错误建议（已撤回）

初次评估时我判断"行权价采集太窄，需要放宽 `OPTION_MAX_STRIKES_PER_SIDE: 6 → 20`"。
**该建议错误，未执行。** 实测：

- `option_chain_snapshots.oi_by_strike` 是一个**独立的 OI-only 抓取**，窗口按标的隐含波动自适应，
  实测 313 个标的、**平均 45.8 档**，AAPL ±17.1%、PLTR ±35.2%——燃料区一直都在采。
- 我第一次筛选用的是 `gex_strike_history`（GEX 窄链，±6 档），所以没看见宽图。
- 窄链本身也**已满足**墙体可信门槛：AAPL above 3.8% / below 4.3% / 6 个到期，
  对应门槛 3% 与 4 个到期（`confidence` 全库为 high 320 / medium 18 / low 404，并非全 low）。

加宽只会增加存储、换不来信息。**真正的缺口是宽图挂在 7 天清理的表上**，由捕获层解决。

## 三、`squeeze_watch`：捕获状态，不做判断

无外键持久表，`PRIMARY KEY (symbol, market_date)`，沿用 `candidate_ledger` 的
持久/被清理分层。字段三类：

| 类别 | 字段 | 来源 |
| --- | --- | --- |
| 燃料 | `call_oi_above`、`put_oi_above`、`top_strike`、`concentration`、`call_put_ratio_above`、`distance_to_top_strike_pct` | 宽 `oi_by_strike` 图，现价上方 10% 窗口 |
| 新建仓 | `unusual_oi_count`、`oi_added` | `option_oi_delta_snapshots`（与上一快照比对确认的 OI 变化，比成交量更强——成交量无法区分开仓与平仓） |
| 上下文 | `gamma_regime`、`gamma_flip`、`call_wall`、`max_pain`、`gex_confidence`、`days_to_cover` | `gex_history` + 空头数据 |

`outcome` 类字段（`fwd_return_5d`、`fwd_max_return_10d`、`reached_top_strike`）
捕获时**一律为空**，由 `resolve_outcomes()` 事后回填，因此捕获状态不可能混入前视信息。
前向 bar 不足的行保持未解析，而不是用短窗口打分——与 `candidate_ledger` 对缺失收盘价的处理一致。

**首次运行（2026-08-11）**：313 个候选 → 276 行落库。

## 四、空头数据：两张表，刻意不合并

许可前提：FINRA 自身条款禁止建库与收费产品使用，**直连不可行**；Polygon 持有转授权，
是唯一合法路径（与 2026-08-09 调研结论一致）。

- `short_interest_history` —— 双周结算快照，累积性持仓。`days_to_cover` 由 API 直接给出，
  **无需 float**（Polygon 只有 shares outstanding，任何"占流通股比例"都会系统性低估，
  故派生百分比必须标注"占已发行股本"）。
- `short_volume_history` —— 日频 T+1，当日卖空股数。其中大部分是做市商当日了结的库存，
  **高比率是活跃度读数，不是累积看空**。两者分表存放，正是为了防止被平均成一个误导性的"空头"数字。

`attach_to_squeeze_watch()` 只回填 `asset_type='stock'`：ETF 的 SI% 常年超过 100%
（实测 XBI 114%、KBE 66%），因为创设赎回使供给弹性、做市商有合法裸卖空豁免——
那不是挤压压力，把它带进挤压表是范畴错误。

## 五、实现过程中修掉的三个自伤

1. **`execute_values` 的 rowcount 只报最后一页。** 首次运行报告 `written: 76` 而实际落库 276——
   分页默认 100/页。已强制单页，使计数诚实。**一个少报自身写入量的运行摘要，
   正是部分失败能不被发现的方式。**
2. **未加节流导致 429。** 全市场端点的游标翻页在两页内即触发限流。这是**绕过路径**
   （不走共享 `provider_rate_limits`），必须自带退避——与 `backfill_iv_history.py` 同一教训，我又踩了一次。
3. **不加日期下界会取反数据。** 端点默认返回 2017 年起的全历史且按 ticker 排序，
   带上限的翻页只会取到**字母序前 47 个 ticker 的完整历史**，而非全市场最新快照
   （首次运行：50 万行仅覆盖 329 个宇宙标的中的 47 个）。`sort`/`order` 参数被该端点忽略，
   **日期过滤是唯一有效的杠杆**。修正后 `squeeze_watch` 命中数由 32 升至 181（全部个股行）。

## 六、验证

- collector **391/391**、server **293/293** 通过（新增 `tests/test_squeeze_watch.py` 11 项）
- 迁移以只建新表方式应用（`squeeze_watch` 28 列、`short_interest_history` 7 列、
  `short_volume_history` 9 列），沿用 GEX 历史那次的 `lock_timeout` 做法避开全量 migrate 的 deadlock
- 空头数据实测：最新结算日 2026-07-31、short volume 至 2026-08-11，各覆盖 321 个标的
- 三张新表已加入 `backup_facts.TABLES`
- PM2 已注册并 `pm2 save`：`quantrift-short-interest`（13:20 PT）→ `quantrift-squeeze-watch`（13:40 PT），
  均为工作日收盘后

## 七、边界与尚未完成

- **产品边界**：后端验证数据，不加产品路由、不加导航、不开放读取端点。
  若将来上前台，措辞只能描述状态（「看涨持仓集中于现价上方 2.7%」），
  不得声称做市商行为或给出 entry/target。
- **样本量**：今天是第 1 天。在积累到可做样本外切分之前，任何基于此表的统计结论都不成立——
  与 short-volume 仅 2.5 年历史适用同一条纪律。
- **阈值仍是猜的**：`SQUEEZE_UPSIDE_WINDOW_PCT=10`、`SQUEEZE_MIN_CALL_OI_ABOVE=100` 均未经校准，
  刻意设得宽松（宁可多记不可漏记），待有样本后收紧。
- **未做**：Massive Advanced（$199/月）的期权逐笔 + NBBO。那是把"做市商方向假设"变成
  "实测流向"的唯一途径（按成交在买价/卖价分类，即可判定客户在买 call 还是卖 call），
  产品负责人 2026-08-11 决定暂不采购。在此之前，本表的方向性判断始终建立在代理假设之上。
