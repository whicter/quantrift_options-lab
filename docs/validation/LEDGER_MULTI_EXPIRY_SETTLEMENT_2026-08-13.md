# 台账多到期日结算：60% 的候选被写成「结构上不可评」，实际是「没人去取价」（2026-08-13）

## 一、发现经过

为回答「策略开发停在哪里」查生产库，本意是确认报价覆盖率是否已恢复。
报价确实恢复了（08-10~08-13 每个交易日 50 个标的拿到真 bid，四天全勤），
候选流量随之从「15 笔同一天」变成每天 111–174 笔、覆盖 44–50 个标的。

但顺手看了一眼构成，问题在这里：

```
08-10 以来入账 538 笔
  single_expiry = false（Diagonal 352 + Calendar 3）= 355 笔  → 永久 not_evaluable
  single_expiry = true                              = 183 笔  → 可评分
全历史 950 笔中 565 笔（59%）不可评分
```

而最新完成批次 6,534 个候选里 Diagonal 占 2,561 个，**前 20 名无一例外全是 Diagonal**，
集中在 IBIT / NVDA。

**台账是判断打分权重是否有效的唯一仪器，而它测不了自己排名最高的那 60%。**

## 二、这个问题 2026-07-30 被发现过一次，但修错了轴

`server/src/routes/ledger.js:23-30` 的注释原文记载：当时台账捕获整个批次、每次约 11,000 行，
其中 64% 是多到期日排列，导致 98.7% 的已结算行无法评分。
当时的修复是 `LEDGER_CAPTURE_TOP_N_PER_SYMBOL=3`——**削的是行数，不是构成**。

前 3 名本身就被 Diagonal 垄断，所以比例从 64% 只降到 60%。
**一个按比例描述的问题，用降低总量来修，比例不会动。**

## 三、根因：两种失败被归成了一类

`evaluateOutcome` 对多到期日一律返回 `not_evaluable/multi_expiry`。这个措辞说的是
「这个结构在单一到期日上不可能被结算」，但真实情况是
「近腿到期时远腿还活着，需要当天的市场价把它平掉，而我们没去取这个价」。

前者是结构属性，永远不会变；后者是数据缺口，提高覆盖率就能修。
把后者写成前者，等于把一个可修的问题登记成了物理定律。

## 四、实测：这个价拿得到，而且很便宜

### 4.1 需要多少合约

每个近腿到期日只需给一批很小的合约定价：

| 近腿到期日 | 待结算行 | distinct 远腿合约 | 涉及标的 |
| --- | --- | --- | --- |
| 2026-08-14 | 64 | **48** | 19 |
| 2026-08-28 | 154 | 147 | 39 |
| 2026-09-11 | 185 | 135 | 35 |
| 2026-09-18 | 122 | 118 | 50 |

对比：一次常规链扫描**单个标的**就是 120–240 个合约。
整个结算日的工作量还不到平时一个标的。

### 4.2 已落库快照能覆盖多少

以 08-13 当天快照对 08-14 的 48 个远腿试算：**命中 36 / 48 = 75%**，全部来自 `ib_internal`
（印证只有 IB 报价通道产出双边市场；Polygon 期权档 `last_quote` 整块缺失，
其行 `bid IS NULL` 是构造性的，不是休市造成的）。

样例（08-13 收盘质量）：

```
ASTS 2026-10-16  65C   bid 14.75 / ask 15.95  → mark 15.350
BAC  2026-10-16  62.5C bid  3.65 / ask  3.85  → mark  3.750
CRM  2026-10-16 200P   bid 16.20 / ask 18.25  → mark 17.225
```

早先按「最近 3 天窗口、全部标的」估算得到的是 45%；差异来自这 19 个标的恰好都在报价清单内。
两个数都对，口径不同——**结算命中率要按结算日当天、按实际待结算标的算**，
用宽窗口全宇宙估会低估。

### 4.3 为什么会缺那 25%

不是到期日维度缺（快照采了 8 个到期日，一直到 2026-10-16，正好覆盖远腿），
是**行权价维度**：diagonal 的远腿是刻意的深度实值（stock-replacement 构造），
落在链采集的 ±5% 窗口外。远腿相对入场 spot 的偏离分布：

| 偏离 | 笔数 |
| --- | --- |
| ≤5% | 414 |
| 5–10% | 125 |
| 10–13.5% | 23 |
| >16% | 3 |

**不要为此放宽 `OPTION_MAX_STRIKES_PER_SIDE`。** 那个窗口约束的是
`option_contract_snapshots`（818 MB）与 `option_oi_delta_snapshots`（492 MB），
占库容三分之二，放宽会重演 2026-07-30 的卷满事故；
而这里要的是一个已知的、每天几十个合约的**精确白名单**，定向抓即可。
同一条教训在 2026-08-11 squeeze 那次已经踩过一遍（当时是查错了表）。

## 五、实现

### 5.1 纯函数：`evaluateOutcome` 支持远腿平仓价

- 结算日 = 各腿中**最早的到期日**，从 `legs_json` 推导，不读 `candidate_ledger.expiry`，
  两者不可能对「哪条是近腿」产生分歧。
- 当天到期的腿按内在价值结算；未到期的腿按 `farLegMarks` 里的实测 mark 平仓。
- **两种失败严格区分**：
  - 完全不传 `farLegMarks` = 调用方从未尝试取价 → 维持 `not_evaluable/multi_expiry`（旧行为）
  - 传了但缺该腿 → `no_price/far_leg_mark_missing`，与「缺标的收盘价」同类
- 绝不用模型价替代缺失的 mark——那会让台账拿模型去评模型自己。

### 5.2 一个被测试抓到的真 bug

第一版写的是：

```js
const mark = Number(farLegMarks?.[legKey(leg)]);
if (!Number.isFinite(mark) || mark < 0) return no_price;
```

`Number(null)` 是 **0**，有限且非负，于是**缺失的报价被当成「远腿一文不值」结算**。
后果是系统性的：远腿是 diagonal 的多头腿，把它记成 0 会把每一笔未取到价的 diagonal
报成亏损——即这套设计本来要防的伪造价格，以最隐蔽的形式出现在防线自己身上。
已改为在 `Number()` **之前**显式拦截 `null / undefined / ''`。

对应测试逐个断言 `[null, undefined, 'n/a', NaN, -1]` 都不得结算。

### 5.3 存储：`ledger_far_leg_marks`

**持久表、无外键**，与 `gex_history` / `candidate_ledger` 同一套「耐久 vs 可剪」纪律。
理由比前两者更硬：

- `option_chain_snapshots` 7 天后被剪，承载这个观测的快照会消失；
- 每个 mark **只有一天可以被观测到**。错过之后任何抓取都无法回补——
  更晚的报价是另一天的价格，用它就是 look-ahead，正是台账存在的目的所要防的。

唯一键 `(settlement_date, symbol, expiry, strike, option_right)`。
`ON CONFLICT DO UPDATE ... WHERE mark IS NULL`：重跑可以补上缺口，但**已取到的好观测永不被覆盖**。

### 5.4 采集：`collector/capture_ledger_far_leg_marks.py`

阶段一，零 provider 调用——只读当天已落库的快照。

- mark **只取双边报价的中值**（`bid > 0 AND ask >= bid`）。
  `last` 是成交价不是可成交价，快照自带的 `mark` 列可能是模型推的，两者都不用。
- 限定**结算日当天**（纽约时区）的快照，按 `snapshot_ts DESC` 取最新一条——
  盘中最后一轮约 15:59 ET，故收盘质量的 mark 无需盘后扫描即已存在。
- **取不到的腿也写行**（`bid/ask/mark` 全 NULL、`source='missing'`）：
  不写的话，「找过但没有」与「从来没找过」不可区分，覆盖率就无法测量。
  NULL 不会到达结算器（`loadFarLegMarks` 过滤 `mark IS NOT NULL`），
  否则它会把该腿按 0 结算——即 5.2 那个 bug 的另一个入口。
- 缺失的腿**逐个具名打警告**，不只报数量：这份清单就是阶段二的工作单，
  而且过了今天就永久不可恢复。

PM2 `quantrift-ledger-far-leg-marks`，工作日 13:15 PT（= 16:15 ET，在最后一轮报价之后）。
入 `backup_facts.TABLES`。

## 六、验收

- server 309/309（新增 5 项：diagonal 正常结算、缺 mark 归 `no_price`、
  不可用 mark 五种取值全拒、结算取最早到期日、legKey 归一化 `'62.50'` 与 `62.5`）
- collector 427/427（新增 7 项：只取晚于结算日的腿、mark 取中值、
  SQL 拒单边/交叉/隔日报价且不含 `c.last`、缺失腿留痕不丢弃、dry-run 不写、
  空结算日是干净返回不是错误、已有 mark 不被后来的 miss 覆盖）
- `--dry-run --date 2026-08-14` 实跑：48 个远腿、19 个标的，
  当日无快照故 `priced=0`（正确行为）

## 六之二、上线（2026-08-14）与上线当天暴露的第二个缺口

### 6.2.1 部署

`node server/src/migrate.js` → `Migrations complete.`，`ledger_far_leg_marks` 三个索引就位。
PM2 `quantrift-ledger-far-leg-marks` 已 start + save，cron `15 13 * * 1-5`。

**一个自伤**：迁移首次执行报 `SyntaxError: missing ) after argument list`。
我在 SQL 注释里写了 `` `not_evaluable` ``，反引号终止了包住整段 SQL 的 JS 模板字符串——
**正是 `docs/learning.md` 在前一天（2026-08-13）刚记下的那一条**。
309 个 server 测试全过也没抓到，因为没有任何测试 `require` 这个文件。
已在该处留下不得使用反引号的行内说明。

### 6.2.2 cron 型 PM2 app 在 `pm2 start` 时会立刻先跑一次

启动瞬间（09:16 PT）就执行了一轮，结果 `priced=0 / missing=48`，48 行全部以 `mark IS NULL` 落库。
**这没有造成损失**，因为 `ON CONFLICT DO UPDATE ... WHERE mark IS NULL` 允许 13:15 PT 那班补上——
如果当时写的是「已有行就跳过」，一次过早的启动就会把当天全部锁死成缺失。
一次性观测的 upsert 条件必须按「是否已拿到好数据」判断，不能按「行是否存在」判断。

### 6.2.3 第二个缺口：报价调度器不知道台账有结算日

`priced=0` 追下去不是 bug 而是缺口。当天 19 个待结算标的中：

- **6 个（GME / MARA / OXY / RGTI / RKT / XLP）根本不在报价清单里**。
  前一晚 16:43 PT 的清单重选（50→100、排序键由 `total_oi` 改为 `underlying_dollar_volume`）
  把它们挤了出去。**那个修复本身完全正确**，但它服务的是「哪些标的值得长期报价」，
  而结算问的是「哪些标的今天不报就永久丢失」，两个问题的答案不必相同。
- 另外 13 个在清单内，但截至 12:16 ET 一个都没轮到（当日已完成 31 个，串行约 4.2 分钟/标的）。
  轮不轮得到取决于陈旧度排序——**可能会成，但赌不起**。

即时处置：按已有按需通道以 priority 90 入队 19 个标的（后台扫描 30，用户实时请求 100），
预计约 80 分钟完成，远早于 16:15 ET 的采集班次。

永久修复：`schedule_quote_refresh.py` 新增 `settlement_symbols` / `enqueue_settlement`。
三条刻意的设计：

1. **不受报价清单约束**（SQL 里没有 `quote_watchlist`）。清单成员资格回答的是另一个问题。
2. **不受队列深度上限约束**。深度上限的存在意义是「别让重复扫描堆积得比串行 worker 消耗得快」，
   被它推迟的标的下个周期会被捡起；结算没有下个周期。
   **拿一个只服务于可等待工作的平滑性，去换一个不可恢复的损失，是错的。**
3. **排在 `effective_watchlist` 的空清单早返回之前**。原顺序下清单为空会连带取消结算——
   把永久损失排在可恢复损失后面，正是 §48「跳过闸门必须覆盖被跳过的每一个字段」那条。
   空清单返回值里同样带上 `settling` / `settlement_enqueued`：跳过不得谎报自己没做的事，
   也不得隐瞒自己做了的事。

另加一条**不静默截断**的告警：按 250 秒/标的估算当日结算所需时长并具名列出全部标的，
装不下当天剩余时段时明确报出来，而不是悄悄少做几个。

实跑验证（09:21 PT）：
`{'settling': 19, 'settlement_enqueued': 0, 'watchlist': 100, 'stale': 69, 'queue_depth': 22}`
——19 个全部被识别，`enqueued=0` 是去重守卫正确跳过了我刚手工入的同批任务。

collector 431/431、server 309/309。

## 六之三、上线次日：41 个好 mark 被另一个 bug 扔掉（2026-08-15）

### 6.3.1 现象

13:15 PT 采集班次 **priced=41 / missing=7**（85%）。但 08-14 的 79 行台账**全部**结算成
`no_price`，零 win/loss。41 个刚取到的 mark 一次都没被读到。

### 6.3.2 根因（先前就存在，被这次改动放大）

`evaluateOutcome` 里标的收盘价的检查**排在远腿检查之前**。而周五的日线只有 49 个标的入库
（正常约 312）——价格采集器 21:26 ET 自己就警告了 `270/319 symbols behind expected 2026-08-14`，
Polygon 当时尚未发布当日聚合。于是 79 行全在第一道闸门返回 `underlying_close_missing`。

致命的是 `evaluateLedger` 把这个结果**写成终态**：查询条件是 `outcome IS NULL`，
写入即意味着永不重看。07-31 那 11 行 `no_price` 是同一个病，只是当时无人追查。

**把「还没采到」当成「永远采不到」**——与本文档主题（把「没人去取价」当成「结构上不可评」）
是同一个形状的错误。修了一个，没看见旁边站着另一个。

### 6.3.3 修复

- **可重试 vs 终态按原因区分**。`underlying_close_missing` 是迟到的数据：过去某个交易日的
  日线是既成事实，只是还没抓；等它到位再结算不构成 look-ahead。
  `far_leg_mark_missing` 相反——只能在结算日当天观测，那天过去就不可能再有，
  永远重试只是推迟一个已经确定的结论。故只有前者进 `RETRYABLE_REASONS`。
- **可重试的缺口不写行**，留 `outcome NULL` 等下个周期；超过 `CLOSE_GRACE_DAYS`（默认 7 个日历日，
  足以跨过长周末 + 周末不跑的价格 cron）才接受这个缺失是答案，否则退市标的会永远重试。
- 新增 `candidate_ledger.resolution_reason` 列。这次是靠 `underlying_at_expiry IS NULL` 反推的，
  只因为两种失败恰好在该列上不同——本该直接读出来。
- `evaluateLedger` 返回 `{resolved, deferred}`，物化结果里分别上报：
  **因为价格源落后而没结算，不得读成因为没有可结算的东西。**

### 6.3.4 数据复位

90 行（07-31 的 11 + 08-14 的 79，全部 `outcome='no_price' AND underlying_at_expiry IS NULL`）
复位为未结算。**这不是编造**：mark 已在正确时刻（08-14 16:15 ET）落库，到期日收盘价是既成历史事实，
采到后重新结算与 look-ahead 无关。拿到收盘价后仍 `no_price` 的行是真结论，一行未动（实际为 0 行）。

随后手动补跑 `collect_prices.py`（Polygon 此时已有 08-14 数据，实测 AAPL 305.93）。

### 6.3.5 端到端验收

```
evaluateLedger -> { resolved: 0, deferred: 75 }     ← 收盘价未齐的正确推迟，不再写死
台账已评分行   15 → 30                              ← 07-31 那批从误终态中救回
no_price 行    90 → 0
strategy_family = time_spread：2 行已评分（1 win / 1 loss）
```

**最后一行是这整件工作的证明**：台账建立以来第一次有多到期日结构被算出真实盈亏，
用的正是 08-14 16:15 ET 抓到的 mark。链路 mark 抓取 → 收盘价补齐 → diagonal 结算 全线打通。

## 六之四、连带修复：交错在物化层被抹掉（2026-08-15）

`interleaveByStrategy` 的注释里**早已写明**这个问题——包括「Diagonal 占据 71% 的
top-3-per-symbol 名额，而它恰好是唯一多到期日、无法单到期日结算的族，
于是引擎最推荐的正是它最无法验证的」。函数写好了、单测覆盖了，
但 `buildCandidateBatch` 随后按 `candidate.score` 全局重排，把它整个抹掉。

两个后果，第二个此前无人提及：

1. 物化批次（喂给 `/api/v1/scanner/candidates` 与 `candidate_ledger` 的那条路径）毫无多样性保证——
   实测 2026-08-13 最新批次前 20 名清一色 Diagonal，只有两个标的。
2. 全局排序读的是**原始分** `score` 而非 `effectiveScore`，
   `directionalWeight` 算出来的方向/gamma 加权**算完就被丢掉**。

改为对合并后的候选池调用 `interleaveByStrategy`，并在 wrapper 上暴露 `effectiveScore`。
同时删掉那条 `ranks globally by score` 的旧断言——它断言的正是被改掉的行为，
且只因 fixture 恰好单调而通过，留着是假性安心。

**教训**：纯函数上的单测无法证明该函数在生产路径里生效。
这是仓库第二次踩同一形状（`directionalWeight` 曾长期因调用方不传 `environment` 而完全空转）。

## 六之五、阶段二：IB 定向报价（2026-08-15）

`IbOptionChainProvider.fetch_named_contracts(symbol, specs)`：按**显式合约清单**取价，
不是按 spot 窗口。每个 spec 经 `reqContractDetails` 解析并以 IB 返回的 conId 匹配，
不拼 expiry×strike×right 笛卡尔积（既有规则）；IB 不认的 spec 跳过而非编造。
按 `(expiry, right)` 分组，一次 `reqContractDetails` 服务共享它们的全部行权价——
7 个缺口跨 5 个标的只需 5 次连接。逐 `(expiry, right)`、逐合约、逐标的三层隔离。

采集脚本改为两趟：先读当日已落库快照（零 provider 调用），再用 IB 补缺口。
第二趟三个门：非 dry-run、`settlement_date == 今天`、盘内。
**中间那个门是硬约束**——用今天的行情去补一个过去结算日，等于把一天的市价冒充另一天的收盘，
正是本表存在的目的所要防的。

**排程随之改到 12:45 PT（15:45 ET，盘内）**。原来的 13:15 PT = 16:15 ET 已收盘，
`is_regular_us_session()` 为 False，第二趟永远不会执行——写完才发现的排程冲突。
15:45 是两趟都能工作的最晚点：快照已积累近 6 小时，IB 报价流仍在。

## 七、尚未完成

- **未部署**：`node server/src/migrate.js` 建表 + `pm2 start ... --only quantrift-ledger-far-leg-marks` + `pm2 save`。
  **有时间窗口**：2026-08-14 有 64 行待结算、48 个合约、约 75% 可取到价；
  当天 13:15 PT 之前没跑起来，这 64 行永久变 `no_price`。
- **阶段二未做**：约 25% 的远腿（深度实值、落在 ±5% 窗口外）需要 IB 定向报价。
  `IbOptionChainProvider.fetch_option_chain` 只能按 spot 附近的窗口抓，
  拿不了指定合约清单，需要新增一个公开方法，用 `reqContractDetails` 逐个解析后再 `reqMktData`
  （不得拼 expiry×strike×right 笛卡尔积——既有规则）。
- **历史行不回填**：现存 36 行 `not_evaluable` 与 529 行未结算的多到期日行，
  其结算日已过或其远腿当日报价从未被采集，**不得用今天的链倒推**。
- **首批可结算样本仍在前方**：08-28（57 笔单腿）、09-18（123 笔）、10-16（129 笔）。
  在此之前不得改动打分权重——目前仅 15 笔已结算且全部为 07-28 同一天建仓，
  统计上接近 n=1，任何权重改动都无法判断改好还是改坏。

## 八、连带发现（未处理）

`buildActionableSetups` 内部按策略交错（`candidateEngine.cjs:926`，有专门测试），
但 `materializeScannerCandidates.js:150` 随后按 score 全局重排，**把交错结果抹掉**。
物化批次是喂给 `/api/v1/scanner/candidates` 和台账的那条路径，
因此没有任何多样性保证——这就是前 20 名清一色 Diagonal、且只有两个标的的直接原因。
与本次结算工作互相独立，单独处理。
