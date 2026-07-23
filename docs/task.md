# Task Tracker

## 📍 未完成任务导航（Open Items Navigator，2026-07-17 生成）

这不是任务清单的副本——具体条目仍然只保留在下面各自原本的位置（每节内的 `- [ ]`）。这里只是一张**全文档未完成项的分布地图**，目的是不必每次通读全文才能回答"还有什么没做完"。全文当前共 **114 项** `- [ ]`（2026-07-22 核对；原 111 项 + Analyze Technical Support Confluence 当前分支整合/回归/部署 3 项），按文档出现顺序分布如下：

0. **近期生产 bug 修复（多为已完成 ✅，按日期）**：
   - `2026-07-22 — Analyze Technical Support Confluence` 🟡 **3 项未完成**：功能代码和专项测试已在 `da298f4` 完成，但基于落后当前 `origin/master` 214 commits 的旧基线；必须先与现有 `/api/sr` / CF-4 / G5 口径整合，再做当前主线全量回归和 Railway/Vercel 生产验收。
   - `2026-07-21 — 快照表 retention` ✅：两张物化表无限膨胀拖慢库,已加 `prune_snapshots` 自动清理,scanner_results 929MB→545MB。
   - `2026-07-21 — 预算行被双 runtime 打回 1000` ✅：盘中整段停摆的根因,默认预算 1000→1,000,000,顺带修 metrics `date` 序列化 bug。
   - `2026-07-20 — 现价陈旧 bug` 🟡 **3 项未完成**：P1(spot 4→1 天)/P2(延迟盘中价路径,默认关)已完成;**P2.1 免费 IB 盘中价(唯一免费真盘中价路径,用户已确认要做)**、P3(现价时间戳标注)、P4(日线 cron 可靠性)待做。Polygon Options 档股票盘中数据 403 死路,已铁证。
   - `2026-07-19 — 调度器饥饿 bug` ✅：16 个"从未成功报价"标的霸占优先级饿死 STX/SRVR/MU 等;修排序 + 禁用 VIX。
1. `2026-07-17 — IV Rank 自给自足` — 3 项，**当前主线、下一个开发项 = Phase 3**：Phase 2.5 已完成（分页 + 月期权回退 + 滚动 grid cache + 分批持久化；核心 SPY/QQQ/IWM/GLD/TLT/TSLA 均达 252+）→ Phase 3 前向口径统一（上线前必须项，设计已写）→ Phase 4 TT 对比 harness → Phase 5 cutover（Mac 可关机）。
2. `2026-07-17 — 全项目 review（架构/算法/功能）` — 15 项：架构 5 / 算法 5 / 功能 5，均未开始，等待用户排优先级。
2b. `2026-07-18 — Analyze 页 synthesis 层 + bug 修复` — **19 项全部完成 ✅**（A 纯 bug 5 / C synthesis 结论引擎 7 / D 策略方向化 3 / B 数据补强 4；含 B1 全到期期限结构 + 密集 ETF 专用窄窗抓取）。
2c. `2026-07-18 — Confluence 支撑阻力引擎` — CF-1 / CF-2 / CF-3 已完成并提交；G5 未通过，CF-4 依 gate 不接入 UI；CF-5 已归档为 v2 搁置项。
2d. `2026-07-18 — 竞品分析 Roadmap R0-R4` — 10 项：竞品复查(等用户试用 alphastockpro/nextpick 后重挖)、R1 决策语言层 3 项(State Matrix/每日简报/板块轮动)、R2 信任层 2 项(候选结果台账/期权原生 Breadth)、R3 叙事层 3 项(财报日历/新闻摄取 MVP/主题聚类)、R4 打磨商业化。全档见 docs/COMPETITOR_ANALYSIS_2026-07-18.md。
3. `2026-07-16 — Page Copy Audit Remediation` — 9 项：`Deferred / requires a separate decision` 2 项 + `Post-audit remaining work (ordered)` 7 项。
4. `🚀 V2 — Real Data`（`数据层决策（已确定）`小节）— 7 项：多数是外部前置操作（UPS 采购、VPS/IBKR 2FA、SMTP/VAPID secrets、Railway TT device challenge），详见该节内"已确认无法由本仓库完成"清单。
5. `✅ Phase 3I — Polygon Licensed Provider` — 1 项：Polygon key rotation，需账户持有人操作。
6. `📋 Phase 3J — 功能对标、竞品分析与下一步路线图`（`实施优先级（执行顺序）`小节）— 6 项：P2.8.4 bounded parallel workers、P2.8.8 stale-while-refresh 前端、P2.8.9 Railway 承载验证、derived IV Rank 252 天门槛（2 处）、Reddit API credentials。
7. **`🛡️ V3A — Product Protection Architecture` — 46 项，全文档占比最大（约一半）**，细分：
   - 当前已确认的问题：5　　·　V3A-2 Materialized Candidate Snapshots：6　　·　V3A-4 Backend Analyze DTO：1
   - V3A-5 Auth/Entitlement Gate：4　　·　V3A-6 部署前置残留：1　　·　V3A-7 Database Permission Boundary：4
   - V3A-8 Shared Cache And Rate Limit：5　　·　V3A-10 Worker And Runtime Boundaries：5　　·　V3A-11 Rollout Plan：6
   - V3A-12 Verification Requirements：4　　·　V3A-13 Rollback：4　　·　V3A-14 Deployment Readiness：1
   - ⚠️ **重要**：本文件"Post-audit remaining work → 执行顺序（E1–E19）"表（在上面第 3 节"2026-07-16 — Page Copy Audit Remediation"内）明确自称是"本文件剩余所有未完成任务的唯一执行顺序"，并已把 V3A 里多项旧 checkbox 对应的实际工作按代码证据标记为完成（E1/E2/E6/E7/E9/E12 等）。也就是说 V3A 这 46 项里有相当一部分是规划期写的细粒度条目，后来被 E 表格核销，但原始 checkbox 从未逐条勾掉——这正是"看起来还有很多没做"这种错觉的来源之一。**判断真实进度请以 E1–E19 表为准**，V3A 原始 checkbox 只作为该表的展开细节保留，不再重复视为独立待办。
8. `🏗️ V3 — Product` — 6 项：Clerk/Stripe 生产密钥注入 ×2、entitlement enforcement 切换 ×1，均等待外部密钥就绪后验收。

**已 100% 完成的早期阶段章节**（V1 Core / V2 Scaffold / Phase 1 UI / Phase 2 Weekly / Infrastructure / Phase 3A / Phase 3B-1 / Phase 3B-2 / Phase 3B-3 / V1 Backlog，共 9 节，零未完成项）已整体移至文末 `🗄️ 已完成归档`，内容原样保留，只是挪出文档前部，不再与进行中的工作混杂。

---

## 2026-07-22 — OI-by-strike 图不连续 + Max Pain 不准（已定方案 = B×自适应,待实现,暂不做）

**触发**:用户看 TSLA OI-by-strike 图稀疏"不连续",问 strike 为什么那么少 + 能不能算 Max Pain。

**根因**:`ecosystem.config.cjs` 的 `OPTION_MAX_STRIKES_PER_SIDE: '6'` —— 采集器每到期只存现价上下各 6 个 strike(TSLA 实存仅 9 个 strike / 66 合约)。这个"6 strikes 省成本"是**为 GEX 优化的**(GEX/Wall 只需近价 gamma 集中区,完整合约带 Greeks+报价数据重),却让所有看 OI 分布的功能陪绑:①OI 图大片空白;②Max Pain **其实已经在算**(`compute_gex.py::compute_max_pain`,当前 TSLA=$370 存在 `gex_snapshots.max_pain`),但从这 9 个 strike 算出的是近价粗估、**不是真·全链 Max Pain**(看不到远端 OI 堆积)。

**关键数据(实测 2026-07-21,证明"一个数走天下"是错的)**:固定百分比或固定 strike 数对全 universe 都翻车,差异数量级——

| 标的 | 现价 | IV | 覆盖 1.5σ 需 ±% | ±10% 的 strike 数 |
|---|---|---|---|---|
| SPY | 742 | 15% | ±9% | 136($1 密集) |
| TSLA | 370 | 48% | ±29% | 25 |
| NVDA | 203 | 41% | ±25% | 16 |
| TSLL(2x) | 12 | 96% | ±58% | 5 |
| SOXL(3x) | 137 | 189% | ±115% | 22 |

同样 ±10% strike 数差 27 倍(SPY 136 vs TSLL 5);覆盖同样 1.5σ 需要的 ±% 差 13 倍(SPY 9% vs SOXL 115%)。固定 20 strikes → SPY 只覆盖 ±1.5%、TSLL 覆盖 ±200%;固定 ±20% → SPY 抓 3 倍冗余、SOXL 只覆盖 0.26σ(Max Pain 算全错)。

**已定方案 = B × 自适应(两个正交维度的组合,用户 2026-07-22 拍板)**:
- **维度 1「窗口多宽」= 自适应**:窗口按各标的自己的预期波动定,不用固定值——`窗口 = 现价 ± (N×IV×√(maxDTE/365))`,N≈1.5,用最远到期算;叠加 strike 数**上限**(防 SPY/SOXL 抓上百,如封顶 ~60/侧)和**下限**(防低 IV 抓太少,如 ≥15/侧)。IV 已有(`volatility_history.atm_iv`/iv30),零新数据。
- **维度 2「抓什么数据」= B(分开)**:GEX/Wall 那条保持**窄窗口(近价 ±1σ)+ 完整合约**(要 Greeks,近价足够);另开一条 **OI-only 宽抓取**(±1.5σ 自适应,**只抓 OI、不要 Greeks/报价**——OI 廉价,所以敢抓宽),专供 OI-by-strike 图 + 全链 Max Pain。
- **为什么是这个组合**:每一块用"正确的宽度 × 该块真正需要的数据",零浪费——SPY 不会抓 130 个带 Greeks 的合约,SOXL 的 OI/Max Pain 能覆盖该覆盖的宽度。跟 B1 期限结构专用窄窗抓取(`68fb47e`)同一套路(那次窄 strike 多到期,这次宽 strike OI-only)。

**待实现(暂不做,用户 token 不足)**:
- [ ] 新增 OI-only 宽窗口采集(现价 ±1.5σ 自适应 window,只取 OI,Polygon snapshot 端点 OI 字段;写入独立的 OI-by-strike 存储或扩展现有)。
- [ ] 窗口按 IV 自适应计算(替换固定 `strike_window_pct`),配 strike 数上下限兜底。
- [ ] GEX 那条完整合约采集保持窄不变(成本不涨)。
- [ ] `compute_max_pain` 改用宽 OI 数据源,得到真·全链 Max Pain;前端 OI 图自动变连续,Max Pain 展示到 Analyze。
- [ ] 单测:自适应窗口对 SPY/TSLA/SOXL 各算出合理宽度 + 上下限截断;Max Pain 全链 vs 稀疏对比。

## 2026-07-22 — Analyze Technical Support Confluence（代码已完成，当前主线整合/部署待完成）

**目标**：在 `/analyze` 为任意已有真实价格历史的 symbol 展示可解释的技术支撑/压力结构，组合
Volume Profile、Anchored VWAP、50/100/200DMA、日线/周线结构、GEX Wall 与最大 OI Wall。

**已完成（commit `da298f4`，专项验证通过）**：
- [x] 新增 `GET /api/technical-levels/:symbol`，只读取 PostgreSQL 快照，不在请求路径同步调用 provider。
- [x] 计算 50/100/200DMA、ATR14、日线 Pivot、周 MA4/12/20/40 与周线 Pivot。
- [x] 使用常规交易时段 30m OHLCV 计算 Volume Profile POC/HVN 和 Anchored VWAP。
- [x] GEX Wall 与 7–60 DTE 最大 OI Wall 分开计算；缺失时 fail closed，不生成替代值。
- [x] 先按 spot 区分 support/resistance，再按 `max(0.5 × ATR14, 0.5% × spot)` 聚类。
- [x] Analyze 面板展示 S/R zones、score、strength、distance、evidence 与期权数据状态。
- [x] 专项验证：server 8/8、frontend 3/3、ESLint 0 error、Vite production build 成功。
- [x] GOOG production-input smoke：spot 346.19、POC 346.00、AVWAP 353.42、50/100/200DMA
  366.12 / 343.21 / 321.99。该 smoke 只验证计算，不代表生产部署。

**重要分支边界（2026-07-22 恢复文档时确认）**：
- `da298f4` 的 parent 是旧 `master` commit `352a23d`；当前 `origin/master` 已前进到 `84eb0ad`，
  两者相差 214 commits。
- 当前主线已经有 `/api/sr/:symbol`、Composite Momentum、CF-1 至 CF-3，以及
  `docs/SPEC_CONFLUENCE.md` 中的 CF-4/G5 gate。新 route 不能直接部署，必须先消除重复职责和算法口径冲突。
- `6d4528b` 与 `56694bc` 中对短版 task 的更新已被本次 2,281 行 canonical task 恢复所取代。

**待完成（3 项）**：
- [ ] 在最新 `origin/master` 上重放/整合 `da298f4`，逐项比较 `/api/technical-levels` 与现有
  `/api/sr`、CF-4/G5，确定保留、合并或删除的职责；禁止直接把旧分支整包部署。
- [ ] 在当前主线运行完整 server/collector/frontend 回归、lint、build，并补 SPY/GOOG 的 API
  contract test；不得只引用旧基线的 8/8 和 3/3。
- [ ] 当前主线整合通过后，按 Railway API → `GET /api/technical-levels/SPY` → Vercel UI 顺序部署，
  验证 SPY 技术结构、无 mock symbol、GEX/OI missing 状态，并记录 deployment ID/日期。

## ✅ 2026-07-21 — 快照表 retention（读写慢的真因之一：两张物化表无限膨胀,已加清理）

**触发**:用户"读写是不是有点慢"。实测:单条索引查询快(17-41ms),但**物化快照表无 retention、无限膨胀**——`scanner_results_snapshots` 929MB/53.6万行(6-14 万行/天,从 07-15 一行没删)、`option_oi_delta_snapshots` 447MB、整库 2.3GB+。这些是每 5 分钟重算的中间产物,**没有功能查它们的历史**(scan/alerts 只读 `MAX(snapshot_ts)` 最新批;weekly/unusual 最多回看 5 个交易日),删旧零功能损失。累积型事实表(`volatility_history` 的 252 天 IV、`price_history`、`iv_history`)绝不动。

**修复(已完成)**:
- [x] 新增 `collector/prune_snapshots.py`:按表配置 retention——`option_chain_snapshots`(snapshot_ts,7 天,**ON DELETE CASCADE 连带清 option_contract_snapshots 853MB / gex_snapshots / gex_by_strike_snapshots / option_oi_delta_snapshots**,一次清 4 张大表)+ `scanner_results_snapshots`(created_at,3 天,独立)。ctid 分批删(每批 5000、每次调用上限 5 万行,大 backlog 分多轮 drain 不长锁 Railway),best-effort 不炸 cycle。retention 天数全 env 可调,覆盖最长消费回看窗口。
- [x] 接入 daemon:每小时跑一次(`SNAPSHOT_PRUNE_SECONDS=3600`)。
- [x] 首轮清理 + VACUUM FULL:scanner_results 删 24.5 万行、**929MB → 545MB**(物理磁盘已还)。
- **验证**:collector `unittest` 242/242(+4:分批到底/上限截断/零 retention 空操作/DELETE 过滤按龄+表)。reload 后 daemon 跑新代码。可复现记录:`docs/validation/SNAPSHOT_RETENTION_2026-07-21.md`。
- **另澄清(用户截图问题)**:①TSLL"metrics 被数据任务阻断"=上面预算章节里那个 `date` 序列化 bug 的直接后果(job 10049 就是 TSLL),已修并实测重采成功,阻断会随下次刷新消失;②TSLL S/R 显示 R $23.63(现价 $10.72)**不是 bug**——TSLL 是 2 倍杠杆 ETF,近 250 日线区间 $10.29-$23.03,$23.63 是真实历史高点 pivot,列表按触及强度排序不按价格排。

## ✅ 2026-07-21 — 盘中数据停摆：预算行被双 runtime 打回 1000 饿死整个交易时段（严重,已修复）

**触发**:用户"为什么数据那么旧 而且 OI 又是空的"。核实:OI 其实不空(TSLA 66/66、AAPL 72/72、SPY 30/30、MU 316/316 都有);真问题是**整个美股交易时段(13:30-20:00 UTC)一条 option 快照都没写**,universe 卡在 9 小时前;盘前 07-12 UTC 却每小时 59-78 条正常。

**根因(双 runtime 抢预算行,与最初 STX 事故同类但机制升级)**:守护日志坐实 `Option refresh scheduler idle (budget exhausted): remaining_budget=0`。`reserve_budget` 的 `ON CONFLICT DO UPDATE SET request_budget=EXCLUDED` 让**任何跑 worker 的进程都会把共享 `provider_request_usage` 行的 budget 覆盖成自己 env 的值**。`run_refresh_worker.py` 模块级 `PROVIDER_DAILY_BUDGET=os.getenv(...,'1000')` 默认 **1000**;Mac 守护进程 env 是 50000,但 **`run_railway_refresh_cycle.py` 也 import 同一 worker**,若 Railway 那侧 env 没设 → 写 1000 → 把 50000 打回 1000。历史行铁证:07-18 那天 `budget=1000`。今天 1000 那版占上风,~1000 个请求在 12:00 UTC 打满,饿死整个交易时段。**这正是 Option B 想根治的双 runtime 争用,只是从"dedup 竞态"变成"预算值互相 clobber"**。

**修复(已完成)**:
- [x] **代码默认 1000 → 1,000,000**:`run_refresh_worker.py` + `ecosystem.config.cjs` + `.env.example`。Polygon 付费无限,预算只是防跑飞兜底,默认必须远高于真实日用量(~1-3k),这样任何 env 没设的进程也不会把生产卡死。生产预算行已手动抬到 1,000,000(remaining 998,995)。
- [x] **顺带修 metrics job `date` JSON 序列化 bug**:`run_symbol_metrics_snapshot` 的 summary 带原始 `datetime.date`(`market_date`),被 `finish_job` 的 `Json()` 序列化时炸 `Object of type date is not JSON serializable`,让 stale-metrics job 全失败(job 10049 实例)。改 `finish_job` 用 `default=str` 容错编码器(`_job_json`),date/Decimal 一律转字符串,不再因记账字段炸整个 job。
- **验证**:collector 238/238(+2:summary 序列化容错、默认预算高值断言)。reload 后近 5 分钟写 20 条新快照,universe 从"9 小时前"开始追平(受 `REFRESH_WORKER_BATCH_SIZE=2` 吞吐限制持续补齐,那是单独的已知项)。metrics job 不再失败。可复现记录:`docs/validation/BUDGET_STARVATION_2026-07-21.md`。
- **残留(交给 Option A / 运维)**:根治双 runtime 争用要么彻底停掉 Railway 侧的 option 刷新(确认 `run_railway_refresh_cycle` 不再被任何 Railway cron 触发),要么走 Option A 单 owner。当前用高默认值让 clobber 无害化,不再饿死,但两 runtime 仍在写同一行。

## 2026-07-20 — 现价陈旧 bug：4 天前收盘价冒充"现价"（严重,进行中）

**触发**:用户在生产站 quantrift.io 看到 TSLA 现价 `$391.06`,实际约 `$381.82`,差近 $9。

**根因(三层,已实测)**:
1. 🔴 **`run_refresh_worker.py::SPOT_HINT_MAX_AGE_DAYS=4`**:期权采集器(每 5 分钟跑)拿"最近 4 天内的日线收盘"当 spot,跳过 `/prev`(源自 `f089fd1` 的省请求优化)。周四 07-16 收盘 391.06 在周一被判"够新鲜",于是每 5 分钟都用它,永远旧。**4 天容忍度是灾难**。
2. 🟡 **日线 cron 只每工作日 13:35 PT 跑一次**(`quantrift-options-prices`,`autorestart:false`),周五收盘要等下周一才入库;`price_history` + `price_history_30m` 都源自这个 cron,所以"现价"整体被锁在日级。实测:全站 72 标的日线全部卡在 07-16,周五 07-17 一根没采(但 Polygon 现在就有——日线端点返回含 07-17 的 5 天)。**已手动补跑,TSLA 日线已到 07-17=380.84**。
3. ⛔ **massive.com/Polygon $29 Options 档:不含任何股票盘中/延迟/快照数据(2026-07-20 铁证)**。Polygon 原文 403:当天分钟→`"Your plan doesn't include this data timeframe. Please upgrade your plan at polygon.io/pricing"`;单票 snapshot→`"You are not entitled to this data. Please upgrade your plan at massive.com/pricing"`;`/prev`(股票 EOD 前收盘)→200 通。测过当天分钟(16-45 分钟前时间戳范围也拒,非"15 分钟窗口"问题)、当天日线、v2/v3 snapshot、grouped daily——**股票侧全部 403,只有 EOD 日线和 `/prev` 通**。**结论:Polygon 确有 15 分钟延迟数据,但属 Stocks 订阅,不在我们的 Options 档里**;免费下 Polygon 拿不到盘中价,能做到的最新 = 前收盘。真·盘中价:①升级 massive/Polygon 加 Stocks 订阅(花钱),或 ②走 IB(免费,见 P2.1)。

**关键设计洞察 + 一个免费的盘中价来源**:光把 `MAX_AGE_DAYS` 4→1 不够——盘中日线未收盘,采集器会一直拿"昨天收盘"。修法是让 `fetch_underlying` **盘中优先取延迟盘中价、日线收盘只在盘后当现价**。**但实测发现 Polygon 分钟盘中不授权**;而**IB Gateway 盘中能给真·标的价**——生产 DB 里 TSLA 07-20 10:22 ET 有一条 `source=ib_internal`、`underlying=374.43` 的快照(另一 agent `8e3df5f` 的 quote-fallback 触发的),这是我们当前**唯一免费的盘中现价来源**。

**修复进展**:
- [x] **P1 `SPOT_HINT_MAX_AGE_DAYS` 4→1(已完成)**:消除"多天前价"。实测周一查 TSLA/SPY/MU 的 `latest_db_spot()` 均返回 None(最新日线周五 07-17=3 天前),强制走 `/prev` 拿前收盘 380.84,不再拿周四 391.06。
- [x] **P2 `fetch_underlying` 加延迟盘中价路径(已完成,默认关)**:新增 `_fetch_intraday_last` + `intraday_spot_enabled`(env `OPTION_INTRADAY_SPOT_ENABLED`,默认 **false**)。因 Polygon 分钟盘中确认 NOT_AUTHORIZED,默认不发那个注定失败的请求(避免 200 标的×每 5 分钟的噪声);升级 Stocks 订阅后置 true 即自动生效。优先级:intraday(开启时)→ spot_hint(近日收盘)→ `/prev`;任何异常优雅回退不炸快照;raw 带 `endpoint`/`as_of`。单测覆盖开启命中/关闭不请求/未授权回退/盘后走 prev 四条路径。collector 236/236。
- [ ] **P2.1 ⭐盘中用 IB 当 underlying 现价源(唯一免费的真盘中价,用户已确认要做)**:Polygon Options 档股票盘中数据 403 已铁证死路,IB Gateway 盘中能给真标的价(实测 TSLA 07-20 10:22 ET `ib_internal` underlying=374.43)。设计:常规交易时段 underlying 现价走 IB(Polygon 仍供期权链/GEX);盘后仍用 Polygon `/prev`。需独立设计 + 开盘时段验收 + 处理 IB entitlement 边界(last/Greeks 可用,bid/ask 受限,IB `10091/10167`)。**这是当前唯一不花钱拿到真盘中现价的路径**。
- [ ] **P3 现价永远带真实时间戳标注**("截至 X 收盘 / HH:MM"):当前 plan 下盘中显示的是**前收盘**,更必须标清楚,绝不把前收盘静默当"现价"。前端 + DTO。
- [ ] **P4 日线 cron 可靠性**:周五那根不该等到周一;已手动补 07-17,但缺日回补机制仍需修。
- **架构澄清(回答"日线 cron 是什么/用户查询是否该拿最新")**:
  - `quantrift-options-prices`(`collect_prices.py`)采的是 **400 天日线 OHLCV + 35 天 30 分钟 K 线**,写 `price_history`/`price_history_30m`,再跑 `derive_volatility`。它喂的是**价格图表、技术指标(MA/RSI/HV/MFI)、HV/IV rank**,**不是"现价"来源**。叫"日线 cron"因为它取日线 bar、每工作日盘后跑一次。
  - **"现价"的正确来源是期权刷新 worker 每 5 分钟写的 `option_chain_snapshots.underlying_price`**(P1 修复后:盘中走 IB/延迟、盘后走 `/prev`,不再复用陈旧日线)。本次 bug 是**两条都陈旧**——日线 cron 冻在 07-16,期权 worker 又把这个陈旧日线当 spot 复用(4 天容忍度)。P1 已解耦:worker 不再信任 >1 天的日线。
  - **产品是"后台刷新"模型,不是"每次查询同步拉 provider"**(见 CLAUDE.md「user requests 不同步调 provider」):用户查询读 DB 里最新快照,后台每 5 分钟刷新。所以"用户每次拿最新、允许延迟"**已经是设计**——前提是后台刷新真的新鲜。修 bug = 让后台刷新的价真的新鲜(P1 已保证前收盘级,P2.1 补上盘中级),而不是改成每次查询同步拉(那会撞 rate limit + 延迟,且违反既定架构)。未覆盖标的的首次查询已有 priority-100 on-demand 入队,是这个模型内的补充。
- **plan 边界(非本仓库可解)**:Polygon 真·盘中分钟需升级 Stocks 订阅(花钱)。当前免费能做到:盘后/盘中默认=前收盘(P1+P2 已保证不再多天陈旧);若做 P2.1 则盘中=IB 实时标的价。

---

## ✅ 2026-07-19 — Option refresh 调度器饥饿 bug（新发现,与 STX 预算耗尽事故不同根因;已修复）

**触发**:用户在 Analyze 页看到「快照约 1424 分钟前采集」提示,追问"数据不是都采集完成了吗"。核实后确认 daemon 本身健康(近 2h 写入 228 条快照),问题是**调度排序**卡死了一批标的。

**根因**:`schedule_option_refresh.py::load_refresh_state` 计算"该刷新谁"时,`latest_snapshots` 查询只认**带有效 bid/ask 的快照**(`EXISTS (...c.bid IS NOT NULL...)`)。scan_enabled 的 81 个标的里有 **16 个从未拿到过一次有效报价**(`VIX、BA、COST、GLD、GS、MUU、NFLX、SPCX、TLT、XBI、XHB、XLRE、XLV、XLY、XOP、XSD`),因此在 `latest_snapshots` 里**完全没有记录** → `select_candidates` 把"无记录"当成"从未采集过",排序排到最前 → 每 30 分钟冷却期一到,这 16 个标的就重新抢占大部分队列名额,把**曾经成功、只是比较旧**的标的永久挤到后面。实测:STX 卡 23.7 小时、SRVR/MU/SMH/DTCR/META/AEHR/XLU/KIE/SOXX/XLP/MRVL/ICLN 共 13 个卡 20 小时左右;**VIX 是单独的永久性失败**——它是指数不是个股,`fetch_underlying()` 调用股票 `/prev` 端点必然返回空(`Polygon prev agg returned no results for VIX`),6 小时内精准每 30 分钟失败一次、连续 11 次。

判断某个具体 job 是否需要报价,已经由另一个独立信号 `require_quotes`(2026-07-19 `8e3df5f` 加的,仅常规交易时段为 true)管;`load_refresh_state` 这条排序查询不需要也不应该再叠加"必须带报价"这个门槛。

**修复**:
- [x] `load_refresh_state` 的 `latest_snapshots` 查询去掉 bid/ask 过滤,改用**任意** `option_chain_snapshots.snapshot_ts`——排序只回答"该不该刷新",不该已经答过的"要不要报价"再问一遍。
- [x] `symbol_universe.VIX.scan_enabled` 设为 `FALSE`(数据变更,非代码;`metadata.disabled_reason='index_underlying_unsupported'` 留痕)。`sync_universe.py` 的 `ON CONFLICT DO UPDATE` 只碰 `active`/`updated_at`,不会把它重新打开。
- **验证**:collector `unittest discover` 232/232(新增 `LoadRefreshStateTests` 3 个)。真实 DB dry-run:修复前 `select_candidates` 输出被 VIX 等 16 个"从未成功"标的常年霸占前排、STX/SRVR 永不出现;修复后 SRVR/STX 正确排到最前(按真实陈旧度 1440/1437 分钟),后面紧跟其余 10 个饿死的标的。`pm2 reload` 后两轮调度周期(~7 分钟)内 STX/SRVR/SMH/DTCR/AEHR 生产环境已刷新成功;VIX 不再出现在 `provider_fetch_jobs` 里,30 分钟失败循环停止。剩余未清空的标的(MU 等)受限于已知的 `REFRESH_WORKER_BATCH_SIZE=2 过于保守`(见下方"全项目 review·架构"节),非本次 bug 范围,会随吞吐量继续清空。
- 可复现记录:`docs/validation/SCHEDULER_STARVATION_FIX_2026-07-19.md`。

---

## 2026-07-17 — Option refresh starvation + 架构 review（进行中，回家继续）

**症状**：生产 Analyze 页（如 STX）显示期权快照过期 ~409 分钟、永远"后台补全中"。STX $745 价格经核实**是对的**（Seagate 2026 AI 存储暴涨，回调自 $1,100，web 核实），不是 bug。

**根因（已查实）**：Polygon 每日预算 `PROVIDER_DAILY_BUDGET`（自设 1000）在 13:45 UTC 打满 → 405 次 `provider budget exhausted` 失败覆盖全部 81 标的。Polygon 付费档（含 $29 Options）**API 调用无限**，所以 1000 是纯自设、成本为零的错误节流。放大因素两个：①调度器预算 gate **fail-open**——`load_remaining_budget` 读不到当天 usage 行时返回 None（当无限额），Mac daemon 上泄漏 ~2.5h（06:46–09:16 PDT 持续 `capacity=20` 灌满已耗尽预算），直到 09:24 PDT 进程重启才恢复；②预算耗尽被当可重试,每个必败 job 重试 3 次(405 = ~135 job × 3)。

**已修并 push（master：`ae58097` 预算修复 + `48b1cbc` Option B）**：
- `PROVIDER_DAILY_BUDGET=50000`（ecosystem.config.cjs + `.env.example`，runaway backstop 非节流）；`provider budget exhausted:` 设为不可重试；CLAUDE.md 更新；collector 测试 188/188。
- 运维恢复：Mac daemon PM2 reload（restart #17，env 生效）；手动把今天预算行 `request_budget` 抬到 50000 打破死锁；已验证刷新恢复（QQQ/AAPL 新快照，count 越过 1000）。

**✅ 已处理（2026-07-17 更新）**：
- **Railway 刷新 cron 已按 Option B 停用**：`48b1cbc` 从 `railway.metrics.json` 去掉 `cronSchedule`,Mac 成唯一写者,不再有"两 runtime 用不同 env 互抢预算行"。**唯一残留操作**:该 config 已提交,但停用需 Railway **重新部署该 service** 才生效——去 Railway dashboard 确认已 redeploy。
- master 已 push（`ae58097`、`48b1cbc` 均在 origin/master）。

**架构 review（已决策 Option B 并实施）**：option 刷新管道曾在 Mac Studio daemon 和 Railway cron 两地同跑一个 DB——预算互抢、dedup 竞态、无单一 owner。
- 真·本地约束:仅 IB Gateway、TT 认证 metrics 必须在 Mac。Polygon 快照/GEX/物化/API/DB 全云友好。
- **Option B（已实施，`48b1cbc`）**:停掉 Railway 刷新 cron,Mac 成唯一写者。零迁移、立刻消除争用。可逆:re-add `"cronSchedule": "*/5 * * * 1-5"`。
- **Option A(目标态,未做)**:Railway 拥有常开产品管道(DB+API+Polygon 刷新+物化),Mac 降级为只跑 IB/TT 的薄适配器。产品不再受家里断电牵制。代价:Railway 镜像要加 node(candidate materializer 是 JS)或移植。

**本会话其它分支状态**：
- `feat/v3a-2-materialized-candidates`（已 push）：V3A-2 后端全套(两表已建生产、materializer、`/api/v1/scanner/candidates`、collector 调度接入、retention)。
- `feat/v3a-frontend-cutover`（本地未 push）：Analyze `/summary` 切流(`applySummary`,server 权威+本地 fallback),待人工浏览器验收;Scanner 未切流(端点是精简候选流,盲切会退化)。

## 2026-07-17 — IV Rank 自给自足（脱离 Mac / TT 依赖，进行中）

**目标**：让 options-lab 产品 100% Polygon-derived、跑在 Railway，彻底不依赖 Mac Studio。诊断结论：唯一真·Mac 依赖是 **TT 的 IV Rank**(device challenge 绑可信 IP);IB 只是 fallback,产品用 Polygon。所以脱离 Mac = 干掉 TT = **自己从 Polygon 算 IV Rank**。IV Rank 自算的机器已存在(`derive_volatility.py::calculate_iv_rank` + `fetch_atm_observations`),缺的只是 252 天历史 + 更干净的日 IV 口径。

**Polygon 历史可行性(2026-07-17 实测,用生产 key)**：
- 期权**价格聚合**回溯 ≥1 年:`/v2/aggs/ticker/O:.../range/1/day/...` 对 1 年前到期的 AAPL 合约返回 14 根日线(首 2025-06-02)。
- `/v3/reference/options/contracts?underlying_ticker=X&as_of=<过去日期>` 能列出历史某天在册的合约 → 可按天定位 ATM。
- **历史 IV/greeks 不提供**(只 current snapshot 有)→ 回填必须**从历史期权价格 BS 反解 IV**(Polygon options 无历史 IV 端点,web + 实测均确认)。

**分阶段计划(带验收)**：
- ✅ **Phase 1 — IV 数学核心(Python,纯函数,可单测)**（E19，2026-07-17 完成)
  - 新增 `collector/implied_vol.py`:`norm_cdf/pdf`、`bs_price(spot,strike,t,r,sigma,is_call)`、`implied_vol_from_price(...)`(二分反解;越界/低于内在价值/超过理论上限返回 None;用二分而非 Newton,对噪声 EOD 价稳健、不需 vega)、`constant_maturity_iv(points, target_days=30)`(按总方差 var=iv²·dte 线性插值到 30 天,范围外持平最近点)、`atm_iv_from_call_put(call_iv,put_iv)`。
  - 验收:`collector/tests/test_implied_vol.py` 12 个（norm_cdf 已知值、put-call parity、反解对 4 个 sigma×call/put round-trip recover 到 4 位、低于内在价值/超上限/非正输入返回 None、constant-maturity 总方差插值/单点/边界 clamp/空输入、call+put 平均）。collector `unittest discover` 200/200（188 → 200）。
  - 真实数据交叉校验(BS 反解 vs Polygon 自报 IV)留到 Phase 2:收盘后延迟快照的 per-contract quote/close 字段稀疏跑不出;Phase 2 取历史 EOD bar(有收盘价)时自然跑上。
- ✅ **Phase 2 — Polygon 历史回填器（机器完成，E20，2026-07-17）**：`collector/backfill_iv_history.py`。纯 helper(`occ_ticker`、`nearest_strike`、`strikes_by_distance`、`select_bracketing_expiries`、`volatility_row`)+ `PolygonHistory`(reference 合并 expired true/false、underlying/option aggs)+ `compute_day_iv30`(选 30 天两侧到期 → 从 ATM 向外走最近 strike 直到取到有成交价那张 → BS 反解 call+put → constant-30d)+ `upsert_backfill_rows`(写 `volatility_history`,`iv_source='polygon_backfill_bs'`)+ `backfill_symbol`/`run` CLI。
  - 关键坑修复:①reference 的 `expired` 只返回一侧,回填跨越 now 需合并 true+false;②精确 ATM 的 $0.50 strike 常无日 bar,须从 ATM 向外走到有成交的整数 strike。
  - 验收:`test_backfill_iv_history.py` 9 个(occ 格式、strike 排序/限量、bracketing、row shape);collector `unittest` 209/209(200 → 209)。**真实数据端到端**:AAPL IV30 recent 0.2954 / 6mo 0.2752 / 1yr 0.2960(均 ~0.28,合理);**DB 写入**:AAPL 14 天 → 10 交易日全部落 `volatility_history`。
- 🟡 **Phase 2 收尾 — 全量回填 RUN(两批均完成,欠填清单已锁定,待 Phase 2.5 修)**:
  - 第一批(2026-07-17,PID 46654,~6.5h):81 symbol → 写入 80(VIX 无期权 aggs 跳过)、18,131 行。
  - 第二批(2026-07-17 启动,2026-07-18 04:25 完成,PID 63275):watchlist.txt 从 81 扩到 201,对 130 个新 symbol 回填(日志 `logs/iv_backfill_batch2.log`)。
  - **两批合计终态(2026-07-18 复核)**:库中 **195 symbol、45,905 行**,其中 **126 个达 252+**(iv_rank ready)、**69 个欠 252**。
  - **欠填 69 个的分类**:①**Phase 2.5 要修的 weekly-dense 标的**——`SPY:67 QQQ:70 IWM:76 GLD:150 TLT:223 TSLA:225 TQQQ:227 SOXS:2` + XL* 板块系(`XLY:138 XLB:147 XLK:151 XLU:151 XLE:152 XHB:242 XLC:246 XRT:248`)+ 大盘股周期权密集名(`NFLX:164 META:212 AAPL:248 NVDA:248 AMZN:249 MSFT:250 GOOGL:250 AVGO:247` 等,均只差最后一段);②**真·稀疏/新上市**(数据本身限制,非 bug)——`EYES:1 MUU:2 UP:4 LTL:12 KLAC:21 SPCX:27 SRVR:40 FCF:46 MQ:66 SMA:72 CBUS:94 INFQ:105` 等小盘;③介于两者之间的中流动性名,修复后重跑能补多少算多少。剩余验收(达 252、`update_iv_rank_readiness` 后 `iv_rank_ready=true`)顺延到 Phase 2.5 修复重跑之后。
- [x] **Phase 2.5 — 修 weekly-dense ETF 欠填(root cause 已实测坐实,2026-07-18)**:高流动 ETF(SPY/QQQ/IWM/GLD/大部分 XL* 板块 ETF)IV30 历史大面积缺失,不是数据缺,是回填逻辑两个 bug 叠加。
  - **实测证据(SPY 2026-03-02,spot 686)**:那天被跳过是因为——SPY 686C **周期权** `2026-04-01`(DTE 30)该天**单日 bar 为 None**(该合约最早 bar 要到 `2026-03-19` 才出现,即历史那天它还没挂牌);而 SPY 685C **月期权** `2026-04-17`(DTE 46)该天有 bar(close 27.63,自 2026-02-02 就有历史)。对照 AAPL 同期月期权正常。
  - **Bug A — `/v3/reference/options/contracts` 撞 `limit=1000` 截断**:SPY 周期权 + 密集 strike,1000 条在 **DTE 17 就耗尽**,30-DTE 及更远的**月期权全被切掉**。实测 `true` 侧正好返回 1000 且带 `next_url`。翻页(`full_grid` follow `next_url`)确实能拿到 DTE 10–53 的完整到期集。
  - **Bug B(真正的杀手,截断只是暴露它)— 周期权在历史某天尚未挂牌**:截断后 grid 只剩近月**周期权**(DTE 10–17),而周期权提前 ~4–8 周才挂牌,历史那天 `option_close` 全 None → `no_priced_strike` → 整天跳过。**关键**:实测证明**光翻页也修不好**——翻页拿到真 30-DTE 到期后其 ATM strike `option_close` 依然 None,因为那批仍是没历史挂牌的周期权。
  - **为什么 AAPL 没事**:AAPL 周期权密度低,1000 条能覆盖到 DTE 54、**包含长期挂牌的月期权**,所以能定价;SPY 唯一能用的月期权(4/17)恰好被截断切掉。
  - **修复方向(两条一起,缺一不可)**:①**翻页**(follow `next_url`)让 grid 能看到远月;②**优先月期权(3rd-Friday)做历史反解**——月期权提前 6–12 月挂牌、有长期价格历史,周期权对历史回填天生不可靠。等价实现:给 `compute_day_iv30` 加**到期回退(expiry-walk)**——当前只有 strike-walk,一旦 bracketing 到期取不到价就放弃;应像 strike 一样向外再试其它到期(优先有历史 bar 的月期权)直到取到。
  - ~~注意:正在跑的第二批带同样 bug~~(第二批已完成,受影响标的已并入上方欠填清单)。
  - **实施计划(2026-07-18 排定,为下一个开发项)**:
    1. `PolygonHistory.expiry_strike_grid` 加**翻页**:follow `next_url` 直到取完(带 max_pages 上限,如 10 页),两侧 `expired=true/false` 都翻;
    2. `compute_day_iv30` 加**到期回退(expiry-walk)**:`select_bracketing_expiries` 返回的到期若 strike-walk 全空,向外再试下一批到期,**优先 3rd-Friday 月期权**(其挂牌早、有长期日 bar);月期权判定 = 该月第三个星期五;
    3. 复用 B1 经验:该修法与期限结构专用窄窗抓取(`68fb47e`)同一套"翻页 + 优先有历史数据的合约"思路;
    4. 修复后**只对欠填的 ~69 个 symbol 重跑** `--days 400`(周末窗口跑,daemon 空闲无争用);
    5. 跑 `update_iv_rank_readiness`,统计终态 ready 数。
  - **验收**:修复后 SPY/QQQ/IWM/GLD/TLT/TSLA + XL* 系全部 `iv_observation_count>=252`(容许真·稀疏小盘仍欠);单测覆盖"翻页拼接"与"到期回退优先月期权"两个路径;两批终态数字回写本节。
  - **实施（`d7175d4`、`cb9f639`、`5a11d4b`）**：`expiry_strike_grid` 对 `expired=true/false` 均跟随 `next_url`（上限 10 页）；`compute_day_iv30` 先走第三个星期五月期权、再回退周到期；相邻交易日复用有界滚动 grid cache；每 25 个交易日做一次幂等 upsert，进程中断不会丢失整段结果。
  - **验证（2026-07-18）**：collector `unittest discover` **226/226 通过**。对核心集合重跑 `backfill_iv_history.py <symbols> --days 400` 后执行 `derive_volatility.run(backfill=False, symbols=...)`：SPY 262、QQQ 274、IWM 274、GLD 276、TLT 276、TSLA 276、XLC 275、XHB 275，均 `iv_rank_ready=true`。
  - **真实数据例外**：XLB 157、XLE 158、XLK 166、XLU 156、XLY 155、XSD 203 仍不足 252；月度查询显示前五个在 Polygon EOD option bars 中从 **2025-12** 才连续，之前仅零散日期，重跑不会补造不存在的观测。保留为 provider historical-coverage 例外，不能标记 ready。零行旧/稀疏 watchlist codes 另有 15 个（ACAC、BATL、BRK、FX、KPK、LINK、LSL、LTV、MINE、NOEM、RE、SGP、SMS、TITI、TTM），不纳入“修复已覆盖”统计。
- [ ] **Phase 3 — 前向口径统一(Phase 2.5 之后立即做,上线前必须项)**:把每日 `atm_iv` 采集改成与回填一致的 constant-30-day 口径,消除"回填段 constant-30d vs 前向段浮动 30-45 DTE 单张 ATM"的方法接缝(接缝会在拼接点产生人为 IV 跳变,直接污染 IV Rank)。
  - **设计**:`fetch_atm_observations`(或其调用处)改为——取 30 DTE 两侧 bracketing 到期的 ATM call+put 快照 IV(Polygon snapshot 自带 IV,当日不需要 BS 反解),`constant_maturity_iv`(implied_vol.py 现成)插值到 30 天;写入 `volatility_history.atm_iv`,`iv_source` 标新口径(如 `polygon_snapshot_cm30`)。
  - **验收**:单测(插值路径/单点回退/无 IV 回退);对若干 symbol 比对新旧口径同日差异并记录;`derive_volatility` 在混合序列(回填段+前向段)上跑通出 iv_rank;文档记录口径切换日期(序列分析时的 provenance)。
- [ ] **Phase 4 — TT 对比验证 harness**:重叠 symbol-日上比 ①IV 水平(自算 atm_iv vs TT `iv_history.iv30`)②IV Rank(自算 vs TT `iv_rank`)。指标 MAE + 相关系数。参考验收线:IV 水平 MAE < ~2 vol 点 & corr > 0.95;IV Rank MAE < ~5–8 点。水平对但 rank 偏 = 方法差异(可修);水平就偏 = 数据/反解问题。
- [ ] **Phase 5 — cutover**:TT 保持并行跑攒重叠样本;Phase 4 达标后各处 `TT_METRICS_ENABLED=false` 下线 TT;从 option provider fallback 序列移除 IB(产品路径)。结果:options-lab = Railway(DB+API+Polygon+derive)+ Vercel,Mac 可关机。

## 2026-07-17 — 全项目 review：架构 / 算法 / 功能（任务间隙,暂不开发)

趁 Phase 2 全量回填后台跑的间隙做的一次全项目复盘,按用户三个问题分类。**全部未开始实现**,遵照"暂时不要继续开发"指令,仅记录待用户后续排优先级。

### 架构（尤其数据获取 / 用户体验)

- [ ] **REFRESH_WORKER_BATCH_SIZE=2 过于保守**:81 symbol 的 watchlist 在低并发下补队列耗时长,是"analyze 页面长期 stale/后台补全中"体验的直接成因之一(STX 事故的邻近病灶,非同一根因)。现在 E7 的共享 provider rate limiter 已经是硬限速闸门,batch size 本身不再是 429 风险来源,可以安全调大。需要先跑一次真实吞吐测量再定具体数字。
  - **已先修复报价链路（2026-07-19，待开盘验收）**：后台 refresh job 过去只把无报价 Polygon snapshot 写为成功，虽然 scheduler 以“最新有 bid/ask”判定覆盖，却未写入 `require_quotes`，因此不会触发 fallback。现在仅在美股常规交易时 job 写入 `require_quotes=true`；worker 按 `polygon_licensed → ib_internal` 尝试，直到拿到有效 bid/ask。休市时仍保存真实 OI/Greeks/结构快照，但不把它当作可执行报价。PM2 改为 `IB_MARKET_DATA_TYPE=1` 并已重载。collector 229/229 通过；2026-07-19 休市实测 Polygon 已写 1,876 条结构合约、0 条 bid/ask，符合休市预期，开盘后需用两合约 IB diagnostic 和实际 refresh job 验收。
- [ ] **on-demand 首次访问延迟**:未采集过的 symbol 首次 analyze 请求要等一整轮 provider fetch,用户体感是"卡住"。可选优化方向:乐观 UI(先显示排队态 + 预计时间)、或提高该 symbol 在 scheduler 里的临时优先级(已有五级优先级机制,只是 on-demand 请求当前未必接到最高档)。
- [ ] **Mac Studio 单点故障**:即便 Option B 消除了预算互抢,产品刷新链路仍 100% 依赖 Mac Studio 常开。断电/重启/网络中断 = 全站数据停摆,且此前确认过恢复要靠人工 PM2 reload。IV Rank 自算(本节上方进行中的项目)是解决这个的唯一路径,而不是加更多本地容灾。
- [ ] **"15 分钟延迟数据"定位**:目前产品文案已经把这个说清楚了,但没有一处告诉用户"下一次刷新还要多久"。可以用 `symbol_data_state` 里已有的字段直接算出下次预计刷新时间展示给用户,成本很低。
- [ ] **回填/历史类任务的 API 调用效率**:Phase 2 回填对每个 symbol-day 要走"expiry grid → strike walk → 逐 strike 逐 call/put 请求"，Polygon 调用量随 symbol 数线性增长但单次不便宜(strike walk 最多 5 次 × call+put = 10 次请求 fallback 路径)。当前 81 symbol × 400 天量级尚可接受,但如果 symbol universe 扩大到几百个,应考虑批量端点或缓存 expiry grid 以外的额外优化。

### 算法

- [ ] **口径接缝(method seam)是最高优先级算法问题**:Phase 2 回填用的是 constant-30-day(总方差插值),但当前前向每日采集(`fetch_atm_observations`)用的是浮动 30–45 DTE 单张 ATM,两段拼接的 252 天序列方法不一致,会在拼接点附近产生人为的 IV 跳变,直接污染 IV Rank(一个对序列噪声敏感的相对指标)。**这使 Phase 3(前向口径统一)从"锦上添花"变成"上线前必须完成项"**,而不是原计划里可以延后的独立阶段。
- [ ] **BS 反解的已知系统性偏差**:`implied_vol.py` 未建模股息(dividend yield)也未处理美式期权提前行权溢价,对高股息标的或深度 ITM 美式期权,反解出的 IV 会系统性偏离真实值。多数 tech/growth 标的股息可忽略,但组合里若含 SPY/QQQ 之外的高股息 ETF 或个股需要留意。
- [ ] **IV Rank 对离群尖峰的敏感性**:标准 IV Rank(区间归一化,`(current - min) / (max - min)`)会被 252 天内单次极端事件(财报/黑天鹅)永久性拉低后续所有读数,直到该尖峰滚出窗口。更稳健的替代或补充指标是 IV Percentile(百分位排名,不受单点极值支配)。可以两个都算,给用户看差异。
- [ ] **候选打分权重未经验证**:candidate engine 的评分权重(DTE/Delta/spread/OI/Volume 等)目前是手工设定,没有做过历史回测或统计校准。Phase 4 的 TT 对比 harness 之后,应该考虑对 scoring weights 做类似的验证。
- [ ] **Scanner 候选多样性问题(有生产实据)**:实测 4768 个候选里 59% 是 time_spread 结构,排名前三全部是 MSFT Diagonal。当前排序纯按分数,没有跨策略类型/跨 symbol 的多样性约束,导致用户看到的"Top N"事实上是同一结构同一标的的重复展示,信息量低。需要引入多样性重排(如按策略类型/symbol 分桶后再取每桶 top-K)。

### 功能

- [ ] **历史 IV Rank / IV30 走势图(评估为性价比最高的新功能)**:Phase 2 回填的数据已经完整躺在 `volatility_history` 里,前端加一个折线图基本是纯展示层工作,不需要新的数据管道。应该排在其它新功能之前。
- [ ] **Alert 投递闭环未完工**:SMTP/VAPID secrets 仍待用户配置和真实收件验收(已在"已确认无法由本仓库完成"清单中),这意味着当前 alert 功能生成了触发但用户实际收不到通知,是功能闭环的缺口而非纯运维遗留项。
- [ ] **候选卡片上的策略回测**:目前候选策略只展示当下静态经济性(credit/debit、POP 估算),没有"这个结构在历史上类似 setup 下表现如何"的回看视角。可以用已有的历史期权价格数据做简化回测。
- [ ] **按用户的自选清单(per-user watchlist)**:当前 watchlist 是全局 `symbol_universe`,没有让付费用户自定义盯盘清单的入口,是订阅分层里"Pro"价值主张的一个自然缺口。
- [ ] **已采集但未被产品充分使用的数据**:期限结构(term structure)、skew、OI density、30 分钟动量等字段已经在采集/派生链路里存在或可以低成本派生,但目前没有对应的用户可见展示。属于"不用新采集就能加功能"的低成本机会。

## ✅ 2026-07-18 — 本地全站逐页体检 bug 修复（API + 源码,dev server 连生产 DB；已完成）

浏览器导航被 Remote Control 挡住,改用 API 响应 + 源码逐页(Home/Learn/Analyze/Scan/Weekly/Account/Portfolio)体检。Home/Learn/Weekly 正常;Account/Portfolio 无 Clerk key 返回 503「authentication not configured」为预期降级。发现两个 bug:
- [x] **🔴 Scan payload bomb(严重)**:`/api/scan` 无视 `limit` 返回 **3759 行 / 18.7 MB**。根因(`scan.js:434` `rows.flatMap`):SQL `LIMIT` 限的是**标的数**,但每个标的被 `buildActionableSetups` 炸开成全部枚举腿(GOOGL 615 / MSFT 601),25 个标的 → 3759 行 × ~2.9KB;前端 `displayedResults` 不切片全部灌进 DOM。**同时是"少数标的霸屏"多样性问题的同一处**。修:每标的按分数封顶 `SCAN_MAX_SETUPS_PER_SYMBOL=5`,全局按分数取 top `SCAN_MAX_CANDIDATES=150`。**验证**:18.7MB→0.55MB、3759→113 行、MSFT 601→5;`scanRoute.test.js` +1(每标的≤5 且按分数降序)。
- [x] **🟡 Analyze 策略卡日期截断成乱码**:`/api/analyze/:symbol/candidate` 显示「到期 Fri Aug 14」、structure「Sell ug 14 / Buy ep 18 750C」。根因(`candidateEngine.cjs:116`):`String(contract.expiry).slice(0,10)`——analyze raw 路径 expiry 是 node-pg 的 **Date 对象**,`String(Date)`=「Fri Aug 14 2026...」slice 成「Fri Aug 14」,再被日历/对角的 `.slice(5)` 砍成「ug 14」。Scanner 路径存 ISO 不受影响。修:新增 `toIsoDate()`(Date→`toISOString().slice(0,10)`,ISO 字符串原样)。**验证**:「到期 2026-08-14」「Sell 08-14 / Buy 09-18 750C」;`candidateEngine.test.js` +1。
- 次要:`status/data` 的 `expected_count 201`(universe 全量)vs `scan_enabled_count 81` 并列易误读,可后续加注「仅 81 scan-enabled」;非阻塞,未改。
- 验证汇总:server `node --test` 171/171(+2)。

## ✅ 2026-07-18 — Analyze 页 synthesis 层 + bug 修复（本地 review,竞品对标；19/19 已完成）

**背景**:用户本地跑 `127.0.0.1:5173`,对比竞品(华尔街咖啡馆式"美股盘中日报")逐图 review Analyze 页,发现根本问题不是缺数据,而是**缺一个 synthesis 层**——所有指标各自展示、互不对话,没有"今日核心结论"、没有跨信号一致/分歧判断、没有全局/局部 GEX 对话、没有波动来源归因。竞品能给出"全局 GEX 为负但局部 Gamma 转正,当前区域有减震"这类结论,而我们 `local_gamma` 一直在算(`compute_gex.py:154`)、进了 DTO、甚至 Tab1 显示了数字,就是没让它说话。

**根因诊断(逐图,已核代码)**:
- 图1 策略卡"每份合约净信用额 $0":`analyzeRecommendation.js` 的 `numberOrNull` 用 `Number(null)===0`,把 debit 策略的 `credit:null` 变成 0,误判为有 credit。且 `scoreCandidate`(candidateEngine.cjs:138)**打分完全不看方向**,多头格局却推 Long Put,自相矛盾。
- 图2 Kalman:`calcKF` 其实是 α=0.12 的 EMA,标签"KALMAN FILTER"名不副实;"Trend Spread"标签 `textAlign='right'` 画在 x=50 被裁成"nd Spread";无周线共振层;三 badge 与期权/量能各自展示不对话。
- 图3 多周期动量:三数字无结论;下方"技术信号"卡 signals 为空仍渲染空壳。
- 图4 IV 期限结构:只 3 个到期日(collector 按 DTE bucket 每桶最多 2 个到期采集);裸数字无斜率/无 contango 结论。
- 图5 OI 分布顶部红色大块:`Tab4Signals.jsx:51-56` 条厚=到相邻 strike 中点距离,首条直接取 `PAD.top`(图表顶边),Y 轴又外扩 32%,最高 strike 的条从顶部糊下来。
- Q2"价格趋势与期权结构如何同时出现"只是并排念动量+PCR,应改为**波动来源归因**。

**波动来源归因算法(可算,非拍脑袋)**:归因 = 6 个有明确输入/阈值/结论的顺序测试,输出标注"模型归因"。
1. 幅度测试:`surprise = |日收益| / (IV_atm/√252)`。`<0.7` 波动在定价内(止);`>1.3` 异常(继续)。
2. 事件测试:`earnings_date`(已采,collect.py:144) ≤3 天 → "事件驱动",最高权重。
3. 跳空分解:用 30 分钟 K 线拆当日波动为隔夜跳空 vs 盘中区间;`gap/(gap+range)>0.6` → 隔夜信息主导(消息面/外盘),`<0.3` → 盘中驱动。
4. 量能确认:`RVol>1.3` 且 OBV 同向 → 真实资金流确认;`<0.8` → 缩量,波动更可能来自对冲盘等结构而非新增资金。
5. Gamma 放大/压制:`local_gamma<0 且 surprise>1.3` → 负 Gamma 放大;`local_gamma>0 且 surprise<0.7` → 正 Gamma 压制。**这是竞品图8结论的定量版**。
6. IV 响应:ΔIV↑+价↓ → 避险定价;ΔIV↓+价↑ → 事件落地 vol crush;ΔIV↑+价↑ → 事件前抢筹。
诚实边界:无新闻源,"消息面"只能归因到"隔夜跳空/事件日历"层级,不点具体新闻,写进文案。

**修复计划(按 A→C→D→B 开发,每步实现→测试→文档→commit)**:

### A. 纯 bug(各 <10 行,先清障)
- [x] A1（5b66867） 净信用额 $0:`numberOrNull` 加 `value==null` 提前返回 null;debit 策略显示"每份合约成本 $X"。
- [x] A2（5b66867） OI 图顶部红块:条厚设上限(min(邻距,~10px)),首尾条不延伸到图表边缘。
- [x] A3（5b66867） "Trend Spread"截断:改 `textAlign='left'` 画在图内。
- [x] A4（5b66867） OI 图左侧 strike 标签堆叠:只标每 N 个 strike + wall/现价。
- [x] A5（5b66867） 技术信号空卡:signals 为空不渲染该卡。

### C. Synthesis 结论引擎(服务端规则,一次建成供全站;价值最高)
- [x] C1（d08702f） 全局/局部 GEX 结论 2×2 规则表(数据已有 `global_gex`+`local_gamma`):++双重减震/区间;+−突破时波动骤增;−+整体放大但现价附近临时减震(竞品 MU 那句);−−最易放大。附加:`|spot-gamma_flip|<1.5%` → "接近 Gamma 翻转位,环境随时切换"。
- [x] C2（d08702f） PCR 白话:`PCR(OI)>1.5` → "看跌持仓是看涨 X 倍,避险偏重";`<0.6` 反向;比较 PCR(Vol) vs PCR(OI) → "今天新增交易比存量更防御/进攻"。
- [x] C3（d08702f） IV→预期波动:复用 candidateEngine 已有的 `expectedMoveForExpiry`,Analyze 页展示"IV X%(Rank Y)→ 到期波动 ±Z%、日波动 ±W%"(竞品的 ±23.4%)。
- [x] C4（d08702f） 一致/分歧检测器(竞品图7那句):三支柱各出方向票——趋势(spread 符号+动量)、期权结构(gamma regime+ΔIV)、量能(RVol+OBV)。三票一致 → 倾向单边;分歧 → "X 与 Y 分歧,价格容易反复,不是单边行情"(点名分歧的两方)。
- [x] C5（d08702f） 今日核心结论:从 C1–C4 + 波动归因按优先级(事件临近>环境切换/翻转位>全局局部背离>一致性)选一条做 Tab1 头条 + 三问导航。
- [x] C6（d08702f） Q2 重写为波动来源:挂上面 6 测试归因算法输出。
- [x] C7（d08702f） 期权大单异动进结论池:`unusualActivity` 已有,top1 并入 C5 可选头条。

### D. 策略候选方向化(图1 根因)
- [x] D1（6df5366） 方向矩阵过滤:`scoreCandidate` 前加环境层(trend regime, gamma regime, IV rank)→ 策略族权重(多头高 IV 提 Bull Put、多头低 IV 提 Long Call、中性高 IV 正 Gamma 提 Iron Condor/Butterfly、空头负 Gamma 提 Long Put/Bear Call);方向冲突策略 score×0.3 并标注"与当前趋势方向相反",不硬删。
- [x] D2（64be27c） 期限结构结论行:斜率分类——升水(contango 常态)/贴水(backwardation 近期事件溢价)/驼峰,一句话。
- [x] D3（b4729f4） 主力筹码标尺:OI 图上方加极简价格尺(现价+双 wall+光带,div/CSS),ChipRuler 降为详情。

### B. 数据采集/计算补强(有依赖,放后)
- [x] **B1（2026-07-18 完成，live 验证）期限结构到期数不足**:root cause 实测坐实——Polygon snapshot 端点对 SPY 返回 12 个到期、每个 ATM IV 都有值,但 `_select_dte_bucket_contracts`(每 bucket 留 2 个)在存库前把大多数到期丢了,库里 SPY 只剩 3 个到期 → 期限结构才 3 行。**不是数据缺,是 bucket 采样丢的**。修法(零额外 API 调用):在 `fetch_option_chain` 里于 bucket 裁剪**之前**、从完整 `raw_results` 算 ATM-per-expiry 期限结构(新纯函数 `build_term_structure`,逐到期取最近有 IV 的 strike、call+put 平均),挂到 `OptionChainSnapshot.term_structure`;`collect_options.persist_snapshot` 写入 `option_chain_snapshots.term_structure`(additive JSONB 列,已在生产 Railway 建列);`server/src/routes/chain.js::deriveChainStats` 优先用存储的完整期限结构、缺失时回退旧的从裁剪链派生。**GEX/候选完全不受影响**(仍用裁剪后的合约集,验证套件不动)。验收:collector `unittest` 220 OK(+4)、server 157/157(+3);**真实 SPY 端到端**:裁剪链仍 3 到期,term_structure 达 **7 到期**(DTE 2→34,IV 0.119→0.157 呈 contango)。注:受 pagination `max_contracts*3` 上限,远端周期权(DTE 10–27)未全进,7>3 已是明显改善;进一步加宽留作后续。
- [x] B2（b16cef4） 假 Kalman → 真 Kalman:新增 `frontend/src/lib/kalman.js`(2 状态 local-linear-trend/constant-velocity 标量滤波,自适应增益,后验方差给置信带),Tab2Trend 接入,"Kalman Filter"标签名副其实。7 单测。
- [x] B3（b1c9493） 趋势图加周线共振层:新增 `frontend/src/lib/trendSeries.js`(`dailySpread`+`weeklySpread`,按 ISO 周重采样再展开回日 x 轴),Tab2Trend 渲染为日 spread 下方更细的第二行。6 单测。
- [x] B4（64be27c） POP 无上下文显得"胜率低":按策略类型加基线说明("买方 POP 通常<50%,用盈亏比补偿概率;卖方反之")。

**覆盖核对**:图1→A1/B4/D1;图2→A3/B2/B3;图3→A5/C4;图4→B1/D2;图5→A2/A4;Q2→C6+归因算法;图7结论→C4;图8结论→C1/C2/C3/C7;今日核心结论→C5。

## ✅ 2026-07-18 — Confluence 支撑阻力引擎（CF-1 至 CF-5 已结案；G5 failed，详见 docs/SPEC_CONFLUENCE.md）

**来源**:另一项目讨论产出 `docs/SPEC_CONFLUENCE.md`(六模块加权共振 → 支撑/阻力 Zone + 强度分 + reasons)。2026-07-18 对照本仓库代码逐条核实其"现状对照"**全部属实**(VP 缺 POC/VA/LVN、S/R 有 pivot 聚类、无 ATR、MA 仅 SMA、GEX 墙全有、无 Fib、无合成层、Focus Score 是动量分与价位正交)。所有输入(250 天日线、30m K 线、GEX)已在库,**零新采集**,纯 serving 计算,与 IV Rank Phase 3-5 完全并行不抢资源。

**评审结论(7 点,已回写 SPEC 修订记录)**:
1. 🔴 **命名合规必改**:"机构级/Institutional" 分档违反 Page Copy Audit 原则(我们删过"机构身份"类断言)。改中性词:极强/强/中/弱,文案"多信号共振强度(模型估算)"+ 注脚。
2. 🔴 **每模块 lookback 未定义(spec 最大遗漏)**:定死——日线 250 天主窗口(S/R/MA/ATR/Fib/日线 VP);Fib anchor = 250 日 max/min + 近 90 日 max/min 两组(重叠加分),Fib 的 swing 选择是全引擎最大主观性来源必须规则化;现有 VP 是 30m 短窗,需**新增日线 VP(250 天)**,30m VP 保留作短线视角。
3. 🟡 **Zone 聚类算法具体化**:`0.5×ATR(14)` 半径贪心聚类;Zone 宽度 = max(成员跨度, `0.25×ATR`)——天然"高波动→宽 Zone"。
4. 🟡 **模块内评分映射要有明确数表**(POC=40/HVN=25/… 类),不能只有权重上限。
5. 🟡 **G5 对照组选错**:不能和 Focus Score 比(动量分,正交);对照 = 现有单点 S/R ±0.5% 带。且**不用等前瞻**——用 250+ 天日线做历史回放(gamma 模块置零,历史 OI 拿不到,spec 已注明),当天出 G5 结论。
6. 🟢 分侧规则:Zone 中心 < 现价 → 支撑侧;跌破收盘确认后整体重算(不复用旧 Zone)。
7. 🟢 权重 40/25/15/10/5/5 仅作冷启动先验(spec 自警与我们"候选打分权重未经验证"审查结论一致),常量表 `CONFLUENCE_WEIGHTS_V1` + 算法版本号 `confluence-v1-prior-weights`。

**与现有项目的融合点(四个,spec 未展开)**:
| 接入点 | 现状 | 接入后 |
|---|---|---|
| Tab4 关键价位 | 观察区间= `putWall~callWall` 两单点 | Zone 表(区间+强度+reasons),walls 降为 Zone 的 reason 之一 |
| scenarioEngine | target = wall+wall 距离(3% floor 拍脑袋) | trigger/target 改用相邻 Zone 边界 |
| coreConclusion 头条池 | 事件/翻转位/背离/一致性 | 新增"价格正测试极强支撑 Zone(HVN+Put Wall+Fib 61.8 共振)" |
| candidateEngine(后期) | strike 只看 delta/wall | 短腿放强 Zone 之外——G5 通过后才做 |

架构:合成层放 `server/src/domain/confluence/`(纯函数+单测),route 只做 IO——与 `analyzeDto`/`positioningSummary` 同模式,后续可物化进 scanner。

**分阶段计划**:
- [x] **CF-1 基础指标**(纯函数+单测,无 IO):`server/src/domain/confluence/indicators.js`——ATR14(Wilder)、EMA20/50/100、SMA200、Fib 层位(23.6/38.2/50/61.8/78.6+ext 127/161.8);扩展 `deriveVolumeProfile` 加 POC/Value Area(70%)/LVN(additive 字段);新增日线 VP(250 天)。**验证**：`cd server && npm test`（163 passed）；本地 `GET /api/vp/SPY?interval=1d&bins=40` 返回 250 日、POC、70.32% Value Area 与 LVN。
- [x] **CF-2 合成引擎**:`server/src/domain/confluence/engine.js`——六路信号收集 → ATR 半径聚类 Zone → `CONFLUENCE_WEIGHTS_V1` 打分 → reasons → 分侧;挂 `GET /api/analyze/:symbol/confluence`。**验证**：纯函数与 route 单测；本地 `GET /api/analyze/SPY/confluence` 用 250 日真实日线与最新 GEX 快照返回区间、逐模块分数与理由。该分数是固定先验模型，不是拟合结果或价格预测。
- [x] **CF-3 G5 回放验证 harness(先于 UI)**:历史回放脚本——逐日用"截至当日"数据算 Zone(gamma 置零),指标 = Zone 触及后 5 日未收破"守住率" + 反转点召回,对照单点 S/R ±0.5% 带。**验收线:相对提升 ≥15% 才进 UI**;不达标则 Zone 仅留 API 供研究 repo 调用,不动生产 UI。**结果**：72 个标的、2024-10-02 至 2026-07-16、`min-history=90` / `horizon=5`；Confluence 守住率 `50.07%`（control `46.44%`），反转召回 `22.14%`（control `27.30%`），综合相对变化 `-2.07%`，G5 **failed**。可复现记录：`docs/validation/CONFLUENCE_G5_2026-07-18.md`。
  - **复核 caveat（2026-07-18，已记入验证文档与 SPEC）**：本次 G5 存在两个方向相反的几何混杂——①**Zone 数量不对等**：confluence 只取 `maxZones:1`,对照组用最多 3 条带/侧,对照在"反转召回"上结构性占优（恰是 confluence 输掉的那项）;②**宽度混杂**：ATR 宽 Zone 天然比 ±0.5% 窄带更易"守住",confluence 守住率优势部分是宽度 artifact。gate 结论是保守方向（未上线）,本次判定不受影响;**v2 重跑必须对齐 Zone 数量（top-3 vs top-3）并做宽度归一**,否则结果不可采信。
- [x] **CF-4 UI 融合(G5 通过后)**:上表前三个接入点。**Gate decision**：未通过 G5，按规格不实现或部署 UI；read-only API 仅供研究调用。
- [x] **CF-5 搁置(同 spec v2)**:权重拟合(有标注数据后让手工值退休)、双顶双底形态、Anchored VWAP、Market Profile/TPO、Order Flow。**状态**：作为明确的非本次实现范围归档；不得绕过 G5 以 UI 形式上线。**v2 重跑前置**：修复 CF-3 复核 caveat 的两个几何混杂（Zone 数量对齐 + 宽度归一）。

工作量估计:CF-1+CF-2 约一个工作会话,CF-3 半个,CF-4 半个。

## 2026-07-18 — 竞品分析 Roadmap R0-R4（newshock / alphastockpro / getnextpick,详见 docs/COMPETITOR_ANALYSIS_2026-07-18.md）

**结论摘要**:三家竞品——newshock(新闻→主题→股票的叙事引擎)、alphastockpro(0-100 分 + Trend Matrix 五桶决策语言,$249-499/年)、getnextpick(AI 研报 + RRG 板块轮动 + 公开 paper bot 记录,credits 制)。**我们的护城河 = 期权原生分析,三家都没有,必须守住加深**。八个差距(G1-G8)中三个红色:G1 零叙事层、G2 无决策语言、G4 无可验证记录。**明确不抄**:带入场/止损/目标价的买卖信号、真金 bot、"AI 荐股"式文案(违反 Page Copy Audit 边界;"它们卖答案,我们卖判断力"是有意选择的赛道)。

- [ ] **竞品复查(等用户试用后)**:本次分析中 **alphastockpro 的 Pro/Elite 内页在登录墙后**(Trend Matrix/3D Matrix/Momentum Radar/30-Min Breakout Scanner/Reddit Trends/Tactical Swings 等只以其官方功能清单还原,未见实页),**nextpick 的 app 内页为 JS 渲染**(Sector Flow RRG 实图/Stock Analysis 详情/AI 研报样例/bot 交易日志只以首页自述还原)。**用户计划注册试用两家**;拿到访问权后重新逐页深挖(截图+具体算法证据),更新 COMPETITOR_ANALYSIS 文档并校正 R1-R4 优先级。
- **R0 — 主线不动摇(进行中)**:IV Rank 自给自足 Phase 2.5 → 3 → 4 → 5(Mac 可关机)。所有新功能不得挤占该主线。
- [ ] **R1.1 Symbol State Matrix(决策语言层,对标 alphastockpro Trend Matrix)**:规则分类全 universe ~200 标的为 5-6 个可操作状态(强势上行/回调买点/底部试探/区间突破/空头/高波动观望),输入全部已有(Kalman 趋势+多周期动量+GEX 环境+IV Rank+RVol),每分类带 reasons(synthesis 层同款)。**顺带解决 scanner 多样性问题**(先按状态分桶再出候选,呼应"全项目 review·算法"节的多样性条目)。
- [ ] **R1.2 每日市场简报(对标 nextpick briefing)**:市场级 synthesis——universe 状态分布(穷人版 breadth)、板块聚合、SPY/QQQ gamma 环境、IV 面貌(IV rank 分布)、top 期权异动、明日财报。每日物化一份,可分享链接/图卡。
- [ ] **R1.3 板块轮动视图(对标 RRG)**:按 sector 聚合已有 per-symbol 数据(universe 元数据已有 sector 字段):平均动量状态、% above MA、gamma regime 分布、IV rank 分布;相对强度 vs 强度动量四象限散点(简版 RRG)。零新采集。
- [ ] **R2.1 候选结果台账(信任层,对标 nextpick bot 记录的诚实版)**:V3A-2 已物化每批候选(表已在生产)——加结果评分:到期/N 日后逐候选记实际盈亏、POP 校准(预测 68% 的桶实际赢率)、按策略族胜率;成熟后开公开"模型记录"页。**一石二鸟:这正是拟合候选打分权重所需的标注数据**(呼应已记录的"打分权重未经验证"技术债与 Confluence CF-5 的权重拟合前置)。定位=模型验证,不是跟单信号。
- [ ] **R2.2 期权原生 Breadth**:% of universe above MA50/200 + 三家都没有的期权版市场体征(% 正 Gamma、IV Rank 中位数、PCR 分布)。数据全在库。
- [ ] **R3.1 财报/事件日历页**:`earnings_date` 已采集,纯展示;+财报前后 IV 行为曲线(IV 历史已回填,可画"财报 IV 冲高-坍缩")。
- [ ] **R3.2 新闻摄取 MVP(对标 newshock,叙事层)**:免费源(GDELT/RSS)→ LLM 分类为事件卡(严重度+关联标的+为什么重要)→ Analyze per-symbol 事件流;**升级波动归因的"消息面"槽位**(从"隔夜跳空"粒度到具体 headline)。排 IV Rank cutover 后或并行于 Railway。
- [ ] **R3.3 主题聚类(newshock 式)**:仅当 R3.2 验证用户参与度后再做。
- [ ] **R4 打磨/商业化**:EN/ZH 双语(对标 alphastockpro,吃第二个市场)、分享卡片、CSV 导出(Pro 权益)、Stripe 就绪后参考 $249-499/年与 credits 制定价锚。部分被外部密钥阻塞。

**排序依据**:R1 全部是既有数据派生(synthesis 层同等杠杆)先做;R2.1 复用 V3A-2 基础设施且偿还已知技术债;R3 需新摄取管道,不与 Mac 独立目标抢资源;R4 部分外部阻塞。

## ✅ 2026-07-16 — Page Copy Audit Remediation

- ✅ 全站：`zh-CN` metadata、产品 title/description、中文主题标签与固定研究/风险披露。
- ✅ 首页：静态预览明确标为示例且非当前市场；产品边界改为数据覆盖、快照候选与研究决策支持。
- ✅ Analyze：移除“盘中即时”“IV 优势”“做市商事实持仓”等断言；GEX/Wall/Flip 统一为带单位和定位假设的模型估算；POP、情景、财报提示改为条件化研究说明。
  - 2026-07-16 copy pass：Q1 先给出“正/负 Gamma 环境 + 估算 GEX”的直接结论，再用一句盘面含义解释波动可能收窄/放大；公开 OI 的模型边界放在结尾，不用“代理符号假设”打断主句。
  - 2026-07-17 copy pass：Q2 直接说明动量与 Gamma 环境组合下可能出现的波动表现；Q3 改为明确的上方/下方关注价位，模型边界仅保留为句末一句。
  - 2026-07-17 strategy-candidate repair：Analyze 改为调用后端的 `/api/analyze/:symbol/candidate`；服务端从最新已报价链生成并只返回入选策略腿，前端不再把 `recommendation` 硬编码为 `null`，也不再接收完整合约链。
  - 2026-07-17 quote-readiness repair：期权链存在不再等于策略腿可用。Analyze 与 watchlist refresh 均把至少一条有效 bid/ask 视为独立完成条件；无报价链按高优先级排队补取，避免 GEX/OI 已有但策略候选永久为空。
  - 2026-07-17 quote fallback repair：`require_quotes` 任务若 Polygon 快照没有有效 bid/ask，worker 自动尝试 fallback；自 2026-07-19 起当前默认 fallback 为 `ib_internal`。两个 provider 都无报价则写入明确的 non-retryable blocker。不会把 mark、last 或日线价格伪装成策略腿报价。
  - 2026-07-17 TT persistence repair：provider 原始 DXLink 元数据可能含 Python `Decimal`；snapshot 写入层统一 JSON 编码为数值，避免 TT 已拿到报价却在 `raw_metadata/raw_contract` 持久化时失败。
  - 2026-07-17 retry classification repair：仅“所有报价 provider 无有效 bid/ask”及认证不可用会阻断 24 小时；序列化等代码故障保留为可重新入队的失败，修复部署后可立即恢复。
  - 2026-07-17 Railway refresh execution repair：原 cloud cron 只执行 `collect.py`，而 API 入队由 `run_refresh_worker.py` 消费，造成 on-demand jobs 永远不执行。cron 现每 5 分钟运行 `run_railway_refresh_cycle.py`：watchlist scheduler → refresh worker → scanner materialization；TT metrics 仍保持禁用，不在该云任务中登录或拉取 IV metrics。
  - 2026-07-17 scanner materialization repair：PostgreSQL GEX 原始 JSON 读回时包含 `Decimal`，`scanner_results_snapshots.payload` 的 JSONB 编码此前会抛错并使 refresh cycle 末尾失败。现与 option snapshot 持久化边界一致，将 Decimal 显式编码为 JSON number；Railway refresh scheduler 固定走 `polygon_licensed` 主 provider，避免将云端 watchlist 工作排到已知会触发 TT device challenge 的 provider。
  - 2026-07-17 on-demand quote retry repair：Railway TT 的 `device_challenge` 是该 cloud worker 的认证状态，不代表 Mac Studio/IB worker 不能采集。Analyze 过去把这类失败记成 24 小时全局 quote blocker，导致队列为空、可用本机 worker 也不能补齐 RKLB 等标的。现仅在 provider 已明确返回“所有尝试均无可用报价”时才阻断；认证失败保持可重试并可交由另一运行面消费。
  - 2026-07-17 provider-construction fallback repair：Polygon key 缺失会在 provider 初始化时抛错，旧 worker 只对“已返回但无 bid/ask”的 Polygon snapshot 做 TT fallback，因而直接重排队且永远不尝试本机 TT。现将可识别的 provider 初始化/连接不可用与无报价统一进入 fallback 序列；RKLB 等 quote job 可由本机 TT/IB 继续消费。
  - ✅ 2026-07-17 runtime acceptance：生产 `GET /api/analyze/RKLB` 从 `option_quotes=false` 恢复为 `ready`；更新后的本机 worker 对 job 1059 先识别 Polygon 未配置、再使用本机 TT 获取真实报价，写入 snapshot/GEX/OI delta/scanner。`GET /api/analyze/RKLB/candidate` 返回后端筛出的具体 Diagonal Spread 两腿、35/63 DTE、真实 bid/ask 与输入 snapshot time。
- ✅ Trend / Options：OBV 改为价量动量；PCR 仅描述 Put/Call 相对比例；外部事件流、OI 异动与数据状态不再暗示净资金流、机构身份或实时性。
- ✅ Scan：已采集报价快照、筛选匹配分、模型定位、社区样本和候选结构均附清晰边界；不再表述为可直接成交订单或预测分数。
- ✅ Weekly：自定义“恐慌/贪婪”改为周度模型分数；Gamma/Wall/Max Pain/ΔOI 改为快照模型与条件情景。
- ✅ Learn / Portfolio / Account：Greek、概率锥、导出水印、策略知识、记录平仓和订阅频率均明确模型/教育/记录边界。
- ✅ 审计记录：`docs/quantrift_page_copy_audit.md` 已加入逐块完成状态和剩余项。

### Deferred / requires a separate decision

- [ ] 全路由 SSR/SSG：当前先在静态 `index.html` 放入可抓取的产品语义摘要；完整 SSR/SSG 需要单独决定框架与部署迁移。唯一条目见 `C. Implement full SSR/SSG only after choosing the frontend migration path`；不要在多处重复登记。
- [ ] 品牌名、域名和商标保护：需要产品所有者在注册商、法务和运营侧执行，不能由 repository 直接完成。唯一条目见 `D. External-owner prerequisites`；不要在多处重复登记。

### Post-audit remaining work (ordered)

#### 执行顺序（2026-07-17 按真实代码校准）

下表是本文件剩余所有未完成任务的唯一执行顺序。每行必须独立完成实现、测试、文档、commit、push。已被后续 section 实现但仍标 `[ ]` 的旧条目，已在本次校准中按代码证据改为 `✅`，不再重复执行。

| 顺序 | 任务 | 为什么是这个位置 | 外部阻塞 |
|---|---|---|---|
| ✅ E1 | V3A-6 内部状态端点权限拆分 | 已完成（2026-07-17）：`/api/status/data` 降级为产品安全摘要，运维明细移入 `/api/admin/status/*` 与 `GET /api/heartbeat/status`，由 fail-closed 的 `ADMIN_API_TOKEN` 保护。 | 部署需注入 `ADMIN_API_TOKEN` |
| ✅ E2 | V3A-9 生产加固：安全响应头 + CI artifact 检查 | 已完成（2026-07-17）：新增 `.github/workflows/ci.yml`（4 job）、前端与 API 安全响应头、`check-dist.mjs` artifact 门、`scan-secrets.sh`、provider 名披露守卫测试。CSP 暂未含 Clerk，见 V3A-9 已知边界。 | 无 |
| ✅ E3 | P2.8.6 ingestion / derivation 解耦 | 已完成（2026-07-17）：`PendingDerivations` 累积一个 batch 内的全局派生请求，`run_pending_derivations` 在 batch 末尾各执行一次；per-symbol GEX 仍即时计算。 | 无 |
| ✅ E4 | P2.8.2 `symbol_data_state` 汇总表 | 已完成（2026-07-17）：additive 表 + collector 写入路径 + Railway 迁移与真实 runtime 证据。API 读路径按依赖顺序留给 E5。 | 无 |
| ✅ E5 | P2.8.1 统一 freshness 口径 | 已完成（2026-07-17）：`server/src/domain/status/freshness.js` 是唯一 freshness 契约；Analyze 按 product 返回 `fresh/stale/missing/queued/failed` + `is_stale` + age + refresh 状态。 | 无 |
| ✅ E6 | P2.8.3 queue-fill scheduler | 已完成（2026-07-17）：按队列深度补满（target 20）+ 五级优先级 + cooldown；候选来源由 `watchlist.txt` 改为 `symbol_universe`。 | 无 |
| ✅ E7 | P2.8.5 shared provider rate limiter | 已完成（2026-07-17）：`provider_rate_limits` 表 + 原子 slot 认领 + 共享 429 惩罚；数据库时钟为唯一权威。file lock 仅在无 DB 时降级使用。 | 无 |
| E8 | P2.8.4 bounded parallel refresh workers | 必须在 E7 之后，否则并发放大 429。 | 无 |
| ✅ E9 | P2.8.7 减少每 symbol 冗余请求 | 已完成（2026-07-17）：Polygon option 采集前用 DB 最新 daily close 作 spot hint，仅缺失/stale 时才打 `/prev`。 | 无 |
| 🟡 E10 | V3A-4 后端 Analyze DTO | 后端已完成（2026-07-17）：positioning/scenario/DTO 引擎 + `GET /api/analyze/:symbol/summary`，结论文案与情景已在服务端生成、provider 名对普通用户降级、测试+真实 DB 验证。前端切流（Analyze.jsx 改读 `/summary`、删除 `analyzeData.js` 重复计算）与 E11 一并做，受 visual-verification 限制。 | 前端切流受 E13 同一 runtime 限制 |
| E11 | P2.8.8 stale-while-refresh 前端体验 | 依赖 E5 与 E10 的 DTO 字段。 | 无 |
| ✅ E12 | V3A-3 剩余：internal/admin chain endpoint | 已完成（2026-07-17）：`GET /api/admin/chain/:symbol` 返回原始链 + 重算的覆盖/质量诊断，复用 `requireAdminToken` fail-closed。 | 无 |
| E13 | A. Playwright 视觉回归 | 放在 UI 改动（E10/E11）之后，避免基线立即失效。 | 无 |
| E14 | A. 生产 smoke 检查 | 依赖 E2 的 CI 与 E1 的端点分类。 | 需要一次真实部署 |
| E15 | V3A-2 materialized candidate snapshots | 纯可维护性/吞吐优化，当前 `/api/scan` 已满足产品契约，优先级低于以上。 | 无 |
| E16 | V3A-8 shared cache / rate limit | 与 E7 重叠：限流/预算协调已由 E7 用 PostgreSQL 覆盖。剩余只是"多实例后是否加 Redis 缓存层"，托管直接用 **Railway Redis**（一键加服务，同 project 内网，非 Upstash）。单实例阶段用不上。 | 决策项：多实例前不需要 |
| E17 | V3A-7 数据库角色边界 | 可交付 SQL + 文档；实际 role 创建需 DB 管理员。 | 需 Railway DB 管理员操作 |
| E18 | V3A-5 auth fail-closed gate | 代码可实现，但 enforcement 必须保持 `false` 直到 Clerk/Stripe 密钥就绪，否则会锁死生产。 | Clerk/Stripe keys |
| E19 | P2.8.9 Railway 承载验证 | 需要 E3-E9 全部落地后的真实 runtime 测量。 | 需真实运行窗口 |

#### 已确认无法由本仓库完成（不要反复重排）

以下任务不是排期问题，而是需要人工采购、账户操作或第三方审批。除非外部条件变化，保持未完成状态：

- 域名注册/DNS/CORS/CSP/canonical、商标法务审查（D 节）
- 已进入 Git 历史的 Polygon key rotation（需账户持有人）
- UPS 采购与断电演练；IB Gateway VPS 采购、固定 IP、IBKR 2FA、72 小时 soak
- SMTP / VAPID secrets → 真实收件验收
- Reddit OAuth credentials → 真实 snapshot 验收
- Clerk / Stripe keys → 真实 sign-in / checkout / webhook 验收
- Railway TT device challenge（TT 将 Railway runner 识别为新设备）
- derived IV Rank 252 个独立交易日门槛（只能随时间积累）
- Unusual Whales API（$125/月，暂缓至有正向现金流）

#### A. Release verification for the copy/model changes

- [ ] Add Playwright visual regression coverage for `/`、`/analyze?symbol=SPY`、`/scan`、`/weekly`、`/learn`、`/portfolio`、`/account` on desktop and mobile viewports.
  - Assert no clipped headers, horizontal overflow, hidden controls, or footer overlap.
  - Assert the homepage’s illustrative/non-current label and fixed research disclosure are visible.
  - Assert GEX/Wall/POP model disclosures appear when those values are rendered.
- [ ] Add production smoke checks after deployment.
  - Verify the deployed HTML contains `lang=zh-CN`, product title/description, static H1 and research disclaimer before JavaScript hydration.
  - Verify the production frontend artifact contains no `.map` files and no API/provider secrets.
  - Verify `/api/scan` and `/api/analyze/:symbol` responses retain source, snapshot time, freshness and model-version fields used by the UI.

#### B. GEX and research-model governance

- ✅ Add a versioned model metadata contract to every GEX-derived product DTO.
  - Implemented in four independently deployable steps: (1) API adapter and persisted scan payload, (2) shared `DataDetails` UI, (3) deterministic GEX/Flip/Wall fixture validation, (4) versioned POP/Expected Move inputs and validation.
  - Step 1 completed: `/api/options/:symbol/gex`, `/api/scan`, and `/api/weekly/:symbol` expose `gex_metadata` with model, data state, coverage and calculation parameters.
  - `gex_metadata.model` carries metric, model version, unit, formula ID, positioning model and public-OI limitation. `data_state` carries status, snapshot time, age, refresh state, confidence and a public source label. `coverage` carries contract/quality and expiry-window fields. `parameters` carries move size, multiplier, local window, flip grid and risk-free rate.
  - Scanner materialization persists this metadata in its existing JSON payload, so it is tied to the GEX snapshot that generated the scanner row. Old rows without that payload are explicitly `partial`, never backfilled with invented assumptions.
  - The UI must render a compact user-facing data-details view and retain a richer admin/debug view.
- ✅ Establish a reproducible GEX validation suite.
  - Step 3 plan: freeze option-chain fixtures with a known valuation timestamp; verify contract exposure, strike aggregation, Global/Local GEX, Wall selection, Gamma Flip interpolation and no-crossing behavior. Recompute the same fixture twice and require byte-stable output.
  - Add a fixture manifest containing model version, valuation date, multiplier, expiry range, expected outputs and tolerances. A separate replay command will load the fixture through the collector calculation path and emit a machine-readable result.
  - Add a real-snapshot comparison report for one ETF and one single stock: snapshot ID/time, option count, missing data ratios, formula inputs, output values and changed-field diff. It is validation of calculation consistency, not a trading-performance claim.
  - Implemented: `collector/tests/fixtures/gex_validation_v1.json`, `collector/gex_validation.py`, `collector/compare_gex_snapshots.py`, and `collector/tests/test_gex_validation.py`.
  - Reproducible fixture command: `cd collector && .venv/bin/python -m unittest tests.test_compute_gex_walls tests.test_gex_validation`.
  - Read-only production-snapshot comparison: `cd collector && .venv/bin/python compare_gex_snapshots.py --symbols SPY,AAPL`. 2026-07-16 result: SPY snapshot `757` (27 usable contracts, missing Greeks `25.00%`) and AAPL snapshot `815` (72 usable contracts, missing Greeks/OI `0.00%`) matched all stored Global/Local GEX, Gamma Flip, Call/Put Wall and Max Pain values within `0.0001` tolerance.
  - Fixed option-chain fixtures must verify per-contract GEX, aggregate GEX, Gamma Flip interpolation, Call/Put Wall selection, 1%-move units and sign-assumption labeling.
  - Run a historical comparison across at least one ETF and one single-stock chain before making any performance or market-structure claim.
- ✅ Define and document expected-move and POP inputs per strategy.
  - Implemented on every concrete Scanner candidate as versioned `expected_move` and `pop` objects. The public DTO does not expose the full chain; it exposes only the selected setup, declared model inputs and the originating quote-snapshot timestamp.
  - Expected Move is `expected-move-v1-atm-iv-sqrt-time`: spot × the mean IV of the nearest same-expiry Call/Put × sqrt(calendar DTE / 365). It declares `contract_iv`, `nearest_atm_call_put_mean`, one standard deviation, calendar-day convention, expiry/DTE, input contracts and lower/upper range.
  - POP is `pop-v1-lognormal-breakeven`: risk-neutral lognormal terminal-price probability at the candidate expiry using that declared IV, `SCAN_RISK_FREE_RATE` (default `4.5%`), zero dividend-yield assumption and executable bid/ask-derived break-evens. It supports static-expiry Bear Call, Bull Put, Iron Condor, Iron Butterfly, Strangle, long/short single-leg and Jade Lizard payoff shapes. Calendar/Diagonal are explicitly unavailable because they do not have one static expiry payoff model.
  - Required inputs are fail-closed. Missing same-expiry ATM IV, non-positive DTE, absent static break-evens or an unsupported payoff shape return `status: unavailable` with a reason; the system never substitutes a fixed POP, mark price or fallback IV. Missing leg quotes prevent candidate construction.
  - Scanner UI renders compact `EM` / `POP` state with an in-context tooltip; EM/POP are model estimates, not a prediction, tradable quote or return guarantee.
  - Verification: `cd server && npm test` covers credit spread, debit strategy, Iron Condor, absent IV and missing quote behavior; route tests assert the public DTO includes the declared fields and contract-IV sample input. Frontend test/lint/build verify the compact rendering path.
- ✅ Reconcile stored watchlist GEX after a model-version upgrade.
  - Root cause observed 2026-07-16: option-chain snapshots existed for 67 watchlist symbols, but 64 latest GEX rows were calculated with the legacy unversioned formula. The API correctly rejected those rows because it requires `gex-v2-1pct-positioning-proxy`, causing Analyze to say GEX/Wall unavailable.
  - `collector/reconcile_gex_models.py` now reads only the latest persisted chain per watchlist symbol, finds missing or version-mismatched GEX rows, and recomputes GEX/Wall/Flip locally from PostgreSQL. It never requests market data.
  - `run_collector_daemon.py` runs that reconciliation at startup and every hour by default (`GEX_MODEL_RECONCILE_SECONDS=3600`). This makes a model upgrade an automatic derived-data backfill rather than a user-visible coverage outage.
  - 2026-07-16 repair: 66 of 67 symbols recomputed successfully. `SRVR` stayed unavailable because its latest chain had a 44.44% missing-Greeks ratio, above the model's 25% quality threshold.
- ✅ Make Analyze-triggered missing-data collection immediate and priority-aware.
  - Analyze already polls `/api/analyze/:symbol`; it now enqueues its missing price, metrics and option-chain jobs with priority `100`. The refresh worker consumes queued jobs by priority before the background watchlist schedule, so an interactive request is not delayed behind cold-start coverage work.
  - Current option chain but missing/current-version-rejected GEX enqueues `gex_recompute` with provider `internal`. The worker reads the latest persisted chain, recalculates GEX/Wall/Flip, and rematerializes Scanner without making an external provider request.
  - Truly missing chains still enqueue `polygon_licensed` option collection. After the worker persists a chain, its existing finalization path computes GEX, materializes OI delta and Scanner output; Analyze's existing five-second poll reloads the page data.
  - Verification: server `npm test` covers priority on-demand jobs and old-GEX local recompute; collector tests cover recompute from the latest persisted chain without provider calls.

#### C. Product architecture and disclosure follow-through

- ✅ Implement a reusable `DataDetails` component across Analyze, Scan and Weekly.
  - `frontend/src/components/DataDetails.jsx` is collapsed by default. Analyze shows the selected GEX snapshot; each Scanner row offers a compact expandable detail; Weekly follows its selected historical GEX point.
  - It shows public snapshot/model context without emitting provider/internal implementation names: model version and unit, snapshot time, contract coverage/completeness, expiry window, positioning proxy and Local/Flip parameters.
  - State vocabulary is rendered as `fresh` / `delayed` / `stale` / `partial` / `unavailable` / `historical`. The detail disclosure is intentionally secondary to the opportunity/analysis result.
- [ ] Implement full SSR/SSG only after choosing the frontend migration path.
  - The current static HTML semantic summary satisfies the immediate crawler requirement; route-level SSR/SSG remains a separate architecture migration.
- [ ] Complete V3A follow-up tasks already specified below: backend Analyze DTO, authorization/entitlement fail-closed gate, internal-status split, DB role separation, shared rate limiting/cache coordination, deployment security headers and CI artifact checks.

#### D. External-owner prerequisites (not executable from this repository)

- [ ] Register and configure any replacement domain; update DNS, Vercel domain mapping, CORS allowlist, canonical URL, CSP/connect-src and email sender configuration.
- [ ] Obtain legal review for the chosen brand/product name and register trademark protection where appropriate.
- [ ] Rotate any provider key that has entered Git history and store replacements only in deployment secret stores. 唯一条目见 Phase 3I 的 `Rotate 曾进入 Git 历史的 Polygon key`；此处仅为索引，不重复登记。

## 🚀 V2 — Real Data

### 数据层决策（已确定）
- ✅ 数据源方案：Tastytrade API（IV Rank，免费）+ provider-first OHLCV（当前默认 IB internal）+ 授权期权链数据源（生产）+ IB API（内部研究/算法验证）
- ✅ 数据采集节点：Mac Studio（复用已有 IB Gateway，clientId=2 与 futures bot 共存）
- ✅ 总数据成本：$0/月（Railway 托管 ~$5/月）
- ✅ 冷启动方案：Tastytrade API 第一天即可提供 IV Rank，同时自积累历史数据
- ✅ Tastytrade 账户注册完成（whicter.han@gmail.com）
- ✅ Tastytrade API 测试通过：/market-metrics 字段确认，认证流程完整验证
- ✅ remember-token 正常续期路径验证通过；遇到 `403 device_challenge_required` 时停止重试并提醒手动完成设备验证，不把认证错误当成可无限重试请求
- ✅ 生产数据原则：IB Gateway 只作为 internal research adapter，不作为公开/付费产品的默认 option chain 数据源，除非授权和再分发权利已确认

**Infrastructure**
- ✅ Railway: 创建 PostgreSQL Service，获取 DATABASE_URL
- ✅ Railway: 创建 Node.js Service，部署 server/，注入 DATABASE_URL
- ✅ 跑 migrate.js 建表（iv_history, scanner_configs）
- ✅ 建表 schema 已定义：server/src/migrate.js
- ✅ Mac Studio collector：配 .env，python auth.py --login，加 cron
- ✅ Vercel: 部署 frontend/，注入 VITE_API_BASE_URL → Railway URL
- ✅ 前端：mock data → 真实 API 调用
- ✅ 生产验收：quantrift.io 308 → www，www 200，Railway /health、/api/metrics、/api/scan 均返回成功（2026-07-14）

**Mac Studio 数据采集脚本**
- ✅ Python 定时脚本：collector/collect.py（每日 4:30pm ET，采集 IV → 写入 Railway PostgreSQL）
  - Tastytrade 认证：collector/auth.py；正常使用 remember-token 续期，device challenge/过期时写入明确错误并发提醒
  - 采集字段：iv_rank, iv30, hv30/60/90, iv_hv_diff, earnings_date, term_structure
  - 2026-07-14 首次手动跑通：写入 21 rows，source=tastytrade；cron 已安装为 1:30pm PT / 4:30pm ET
  - 2026-07-16 验收：authenticated Mac Studio 手动运行写入 67/67 watchlist rows、0 errors；生产 `/api/metrics?symbols=AAPL,PLTR,TSLA` 返回当天 `fresh` hybrid metrics，`iv_rank_source=tastytrade`。本机 crontab 已核实为每个工作日 13:30 PT。
- ✅ 数据覆盖状态 API：`GET /api/status/data` 读取 collector watchlist，并返回 `iv_history` 覆盖率、缺失标的、stale 标的、source 分布和最新日期
  - 同时返回 `price_history.table_exists`、价格覆盖数量和最新价格日期
- ✅ IB 连接管理：IB option fallback 默认 `IB_OPTION_CLIENT_ID=42`，price fallback 默认 `IB_PRICE_CLIENT_ID=12`，不再复用含糊的 clientId=2；均可由环境变量覆盖并与 futures bots 隔离
- ✅ 服务层自动切换：derived IV Rank ready 后 API/scanner 使用 derived；batch collector、on-demand API 与 refresh worker 均停止为该 symbol 调用 Tastytrade（2026-07-15）

**基础设施可靠性 / 云端迁移**
- [ ] Tastytrade collector 迁移：从 Mac Studio 搬到 Railway Cron Job（纯 REST API，无需本地网关，可直接云端跑）
  - ✅ 独立 one-shot image/config：`collector/Dockerfile.metrics` + `collector/railway.metrics.json`
  - ✅ 固定 UTC 盘后 schedule：`30 22 * * 1-5`；`restartPolicyType=NEVER`，进程完成后退出
  - ✅ Secret contract：`DATABASE_URL`、`TT_LOGIN`、bootstrap `TT_REMEMBER_TOKEN`（仅在 Railway 自己的 `provider_auth_state` 尚无记录时使用）、`TT_BASE_URL`、`TT_USER_AGENT`；镜像排除 `.env` 与本地 venv。`auth.py --login` 只会 seed 到该进程绑定的数据库；只有相同 `DATABASE_URL` 才与 Railway 共享。Railway 不需要接收 successor token。缺 `TT_LOGIN` 时 collector 必须在本地 fail closed，不能向 TT 发送请求。
  - ✅ Token-state durability：新表 `provider_auth_state(provider, remember_token, updated_at)` 是本机与 Railway Cron 的唯一续期状态。每次 exchange 先取得 PostgreSQL transaction advisory lock，201 后在同一事务写入 successor/当前 token；401/403/网络失败 rollback，不改状态。`TT_REMEMBER_TOKEN` 仅在数据库无 row 时 bootstrap；数据库 token 401/403 后不再拿环境 seed 发第二条请求，不进行密码 fallback。环境中误加的成对引号会在 bootstrap 前去除。无需 Railway `/data` Volume。
  - ✅ Migration runtime：2026-07-16 `source collector/.env && node server/src/migrate.js` 成功；只读 `to_regclass('public.provider_auth_state')` 返回表存在、`row_count=0`，未读取 token 值。
  - ✅ Verification：collector `unittest discover -s tests -v` 111/111 passed；server `npm test` 65/65 passed；`docker build -f collector/Dockerfile.metrics -t quantrift-metrics-cron:test .` passed after PostgreSQL token-state change
  - ✅ Railway 独立 service：`quantrift-metrics-cron` 已创建，config path 为 `/collector/railway.metrics.json`，DB/TT variables 已注入，Git deployment active（2026-07-16）
  - [ ] Railway TT metrics run（阻塞于 provider device challenge）：2026-07-16 本机以现有用户名/密码成功登录并将 fresh remember-token 写入共享 PostgreSQL；紧接着 Railway cron 使用同一 fingerprint 认证，TT 返回 `403 device_challenge_required`。确认 Railway 网络、数据库和 token state 均可达，但 TT 将 US West runner 识别为新设备。镜像现默认 `TT_METRICS_ENABLED=false`，保证后续 Railway schedule 不会读取凭据或调用 TT。当前可用路径是 Mac Studio 的 authenticated collector 写同一 Railway PostgreSQL；只有在 Railway 上完成明确的 TT device challenge 后，才将变量改为 true 并恢复此 cloud-cron task。
- [ ] Mac Studio 断电风险：加装 UPS（如 APC Back-UPS）并完成断电恢复演练
  - ✅ macOS 自动恢复已验证：2026-07-16 `pmset -g custom` 返回 AC Power `autorestart 1`；市电恢复后系统会自动重启。
  - ✅ PM2 开机恢复已验证：LaunchAgent `pm2.congrenhan` 的 `RunAtLoad=true` 执行 `pm2 resurrect`；`~/.pm2/dump.pm2` 包含 `quantrift-options-collector`、`quantrift-options-prices`、`quantrift-reddit-trends`、`quantrift-universe-metadata`、`quantrift-unusual-whales-flow`。
  - [ ] UPS 采购、接入并进行断电/复电演练仍需物理硬件操作；验收需确认 Mac、IB Gateway、PM2 collector 均自动恢复且无未处理 jobs 丢失。
- ✅ IB Gateway 云端迁移评估：结论为固定出口 Linux VPS + pinned Docker/IBC + private API；模板见 `ops/ib-gateway/`（2026-07-15）
  - 需解决：云端固定出口IP（避免触发IBKR异常登录验证）、2FA 首次人工确认 + 后续会话保活
  - 上线前置条件：面向付费用户/需要高可用时必须完成此项，个人 Mac Studio 不适合作为生产基础设施
  - ✅ Security template：paper + read-only 默认、password secret file、4001/4002 仅 loopback、persistent settings、pinned image
  - ✅ Verification：collector 85/85 tests；`docker compose config --no-interpolate` passed
  - [ ] 实际 VPS 采购、固定 IP、防火墙、IBKR 2FA 与 72 小时 soak test 需要人工账户/硬件操作
- ✅ 心跳监控：Mac Studio → Railway 心跳上报，云端检测断线并持久化告警（P2.3，2026-07-15）

**前端路由（Vite + React Router）**
- ✅ 安装 react-router-dom，配置多页路由
- ✅ `/` 产品入口：Quantrift hero 使用真实 scanner 视觉、live Market Regime、Scan/Analyze/Weekly workflow；品牌导航返回首页；desktop/mobile responsive
  - 2026-07-16：首页 Hero 的主入口改为高亮“分析标的”，次级入口为“打开扫描器”；workflow 卡片同样以 Analyze 为首项。
  - 2026-07-16：`/analyze` 未指定 symbol 时默认加载 SPY；Hero 主入口直接使用 `/analyze?symbol=SPY`。
- ✅ `/learn` → V1 教育工具（Learn.jsx）
- ✅ `/analyze` → V2 标的分析页（真实数据：GEX / 价格趋势 / OI异动）
- ✅ `/scan` → V2 扫描器页（真实数据：scanner_results_snapshots）

**V2 核心流程（ticker-first）**
- ✅ 用户输入标的 → 系统分析（不再要求用户先选策略）
- ✅ 技术分析层：MA20/50/200、RSI、MACD → 方向评分
  - 真实输入：`price_history`
  - 60日历史不足 MA200 时返回 `ma200=null`，不伪造长周期数据
- ✅ IV 分析层：IV Rank + IV vs HV → 卖方/买方判断
  - 真实输入：`/api/metrics`
  - recommendation matrix 使用 IV Rank / IV30 / HV / trend score / GEX context
- ✅ 事件风险：财报日检测
  - 真实输入：`iv_history.earnings_date`
  - `/api/scan` 返回 `earnings_date`
  - Scanner 前端显示财报日期；距离当前日期 0-14 天时标记 warning
- ✅ 策略矩阵 → 推荐具体策略 + 建议 Delta/DTE/宽度参数
  - High IV + neutral/positive GEX：Iron Condor
  - High IV + bullish trend：Bull Put Spread
  - High IV + bearish trend：Bear Call Spread
  - Low IV：Long Straddle
  - Mid IV：small defined-risk directional spread

**功能**
- ✅ 用 live 链数据填充推荐策略的 legs（后端 `candidateEngine.cjs` 使用真实同到期 bid/ask contracts，输出 expiry/DTE/legs/credit/debit/max loss/breakeven/RoR）
- ✅ Options scanner: IV Rank / spread width / liquidity / DTE / Greeks 阈值（server contract filters + frontend presets/advanced filters 已实现；无完整可执行 legs 时 fail closed）
- ✅ Push notifications pipeline：Scan 可按当前 IV Rank/Gamma/异动条件创建 email 或 browser push subscription；token 退订；collector 每次 materialize 后评估；delivery 表按 subscription+batch+symbol 去重
  - ✅ 无 SMTP/VAPID 时 delivery 明确 `blocked`，不假装 sent
  - ✅ Railway additive migration、API create/unsubscribe、PM2 evaluator dry-run 已验证
  - [ ] 人工配置 SMTP 与 VAPID public/private secrets 后完成真实 inbox/browser 收件验收

**✅ Phase 3D — Options Positioning Data Layer（已完成，Polygon 已在 Phase 3I 替代 IB internal 成为生产 provider）**

> IB Gateway internal adapter 仍作为 research/fallback 代码保留，但不再是生产采集路径。Schema、GEX 计算、API、前端均为 provider-agnostic，无需改动。

目标达成：option chain → snapshots → GEX / Wall / Gamma Flip → API → UI 完整闭环已在 Polygon licensed provider 下验证通过。

边界：
- ✅ `source=ib_internal` 只允许用于内部研究、算法验证、字段探索和个人使用。
- ✅ 不把 IB Gateway 放进公开用户请求链路；用户输入 symbol 时 API 只读 PostgreSQL 最新 snapshot。
- ✅ 不把 IB option chain 数据宣传为正式授权产品数据。
- ✅ 所有 API response 必须返回 `source`、`snapshot_ts`、`freshness`、`is_stale`、`provider_status`。
- ✅ provider adapter 必须可替换：IB internal adapter 与未来 licensed provider adapter 使用同一接口。

**Phase 3D-1 — Schema & Provider Contract**
- ✅ 定义 provider interface：
  - `fetch_underlying(symbol) -> spot, bid, ask, timestamp, source`
  - `fetch_option_chain(symbol, expirations, strike_window) -> contracts[]`
  - 当前文件：`collector/providers/base.py`
  - 当前实现：`UnderlyingSnapshot`、`OptionContractSnapshot`、`OptionChainSnapshot`、`OptionChainProvider`
- ✅ 新增 IB adapter skeleton：
  - `collector/providers/ib_option_chain_provider.py`
  - 只定义 `source=ib_internal` 和接口入口；实采逻辑留给 3D-2
- ✅ 新增 PostgreSQL schema：
  - `option_chain_snapshots`
    - `id`, `symbol`, `underlying_price`, `underlying_bid`, `underlying_ask`, `snapshot_ts`, `source`, `provider_status`, `provider_snapshot_id`, `contract_count`, `completeness_pct`, `missing_greeks_ratio`, `missing_oi_ratio`, `raw_metadata`, `created_at`
  - `option_contract_snapshots`
    - `snapshot_id`, `symbol`, `expiry`, `strike`, `option_right`, `bid`, `ask`, `last`, `mark`, `volume`, `open_interest`, `iv`, `delta`, `gamma`, `theta`, `vega`, `rho`, `bid_size`, `ask_size`, `contract_symbol`, `local_symbol`, `con_id`, `provider_contract_id`, `raw_contract`
  - `gex_snapshots`
    - `snapshot_id`, `symbol`, `snapshot_ts`, `source`, `global_gex`, `local_gamma`, `gamma_flip`, `gamma_regime`, `spot_vs_flip_distance_pct`, `call_wall`, `put_wall`, `wall_method`, `max_pain`, `pcr_oi`, `pcr_volume`, `confidence`, `gamma_curve`, `raw_metrics`
  - `gex_by_strike_snapshots`
    - `snapshot_id`, `symbol`, `strike`, `call_gex`, `put_gex`, `net_gex`, `call_oi`, `put_oi`, `call_volume`, `put_volume`
  - `provider_fetch_jobs`
    - `symbol`, `job_type`, `provider`, `status`, `attempts`, `request_params`, `result_summary`, `last_error`, `created_at`, `started_at`, `finished_at`
- ✅ 新增只读 API skeleton：
  - `GET /api/options/:symbol/snapshot`
  - `GET /api/chain/:symbol`
  - `GET /api/gex/:symbol`
  - `GET /api/status/options`
  - missing snapshot 返回 `freshness=missing`；不触发 provider；不等待 IB Gateway
- ✅ Migration rollback plan：drop new tables only；do not touch `iv_history` or `price_history`.
- ✅ Migration executed：`NODE_ENV=production node src/migrate.js`
- ✅ Local API smoke verified：
  - `curl -f "http://127.0.0.1:3001/api/options/PLTR/snapshot"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/chain/PLTR"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/gex/PLTR"` → `freshness=missing`
  - `curl -f "http://127.0.0.1:3001/api/status/options"` → `table_exists=true`, `covered_count=0`, `missing_count=67`

**Phase 3D-2 — IB Gateway Internal Adapter**
- ✅ 新增 `collector/providers/ib_option_chain_provider.py`
- ✅ 新增 `collector/collect_options.py`
  - provider → `option_chain_snapshots`
  - contracts → `option_contract_snapshots`
  - job status → `provider_fetch_jobs`
- ✅ 使用 IB API `reqSecDefOptParams` 选择 bounded expiration buckets；再按 `expiry + right` 调用 `reqContractDetails` 获取 IB 实际存在的合约。
- ✅ 禁止本地构造 expiry × strike × right 笛卡尔积：
  - `reqSecDefOptParams` 返回的 expiry 集合和 strike 集合不是合法合约对的映射，不能互相组合。
  - 持久化前必须有 IB 返回的非零 `conId`、`localSymbol`、精确 expiry、strike 和 right。
  - 对实际返回的 contracts 做 spot range、每边 strike 数、每 expiry cap 和 global cap 过滤。
  - 同一 snapshot 按 `conId` 去重；不存在的组合不会进入 market-data 请求或数据库。
- ✅ 限定过渡阶段采集范围：
  - symbols：先 `AAPL`, `SPY`, `QQQ`, `PLTR`
  - DTE：7-60 days
  - strikes：spot ±15% 或每边最多 20 个 strikes
  - rights：call + put
- ✅ 对每个 option contract 请求 market data snapshot：
  - bid / ask / last / volume / open interest
  - model greeks：iv / delta / gamma / theta / vega
- ✅ 记录 IB pacing / timeout / empty contract：
  - 每 symbol 最大运行时间
  - 每批 contract 数量
  - provider error code
  - snapshot completeness percentage
- ✅ 失败策略：
  - underlying 缺失：整 symbol snapshot fail，不写 partial GEX
  - chain 缺失：写 job failure，不覆盖旧 snapshot
  - 部分 contract 缺 Greeks/OI：写 contract row，但 `completeness` 降低；GEX confidence 降级
- ✅ Runtime smoke with IB Gateway：
  - Command：`OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 IB_OPTION_CLIENT_ID=43 IB_TIMEOUT=25 venv311/bin/python collect_options.py`
  - Result：snapshot written，latest `snapshot_id=2`
  - API verified：`/api/options/PLTR/snapshot` 返回 `source=ib_internal`、`provider_status=partial`、`contract_count=10`
  - API verified：`/api/status/options` 返回 `covered_count=1`、`covered_symbols=["PLTR"]`
- ✅ Data quality follow-up 3D-2A：
  - 当前 IB 返回 chain definition / expiry / strikes，但 option quote、Greeks、OI 均为空：`completeness_pct=0.00`、`missing_greeks_ratio=1.0000`、`missing_oi_ratio=1.0000`
  - 已补 delayed market data tick parser：
    - delayed bid / ask / last / close：tick 66 / 67 / 68 / 75
    - delayed bid size / ask size / volume：tick 69 / 70 / 74
    - delayed option computation：tick 80 / 81 / 82 / 83
  - 已保留 live option computation fallback：tick 10 / 11 / 12 / 13
  - 已将 per-request IB error code 写入 contract `raw_contract.errors`
  - 已新增 `collector/debug_ib_option_ticks.py`，用于打印 raw tick payload 与 IB error code
  - Verification：
    - Syntax verified：`venv311/bin/python -m py_compile collect_options.py debug_ib_option_ticks.py providers/ib_option_chain_provider.py`
    - Runtime diagnostic attempted：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 IB_OPTION_CLIENT_ID=44 IB_TIMEOUT=30 IB_OPTION_SNAPSHOT_GRACE_SECONDS=3 venv311/bin/python debug_ib_option_ticks.py`
    - ✅ Runtime diagnostic rerun（2026-07-18，IB historical farm 恢复后）：以 `SPY`、2 个实际合约、client id 45 运行成功（exit 0）。Delayed tick 83 返回 IV/Delta/Gamma/Theta/Vega；tick 27/28 返回 OI；tick 74 返回 volume；tick 68 返回 last。Gateway、historical fallback 和 option tick 解析均已验证。
  - Remaining risk：
    - 已确认 quote 限制：同次诊断收到了 IB `10091` / `10167`（API 未订阅实时 market data，显示 delayed），bid/ask 为 null、last/Greeks/OI 仍可用。需要完整 bid/ask 时，仍需启用对应的 IB API quote entitlement；这不是 historical farm 故障。

**Phase 3D-3 — GEX / Wall / Gamma Flip Calculation**
- ✅ Transition provider decision：
  - 使用 `tt_internal` 作为当前过渡 option-chain metadata provider。
  - 后续正式上线前仍需购买具备授权/再分发权利的数据源。
  - public API 仍然只读 PostgreSQL snapshot，不同步调用 tastytrade 或 IB。
- ✅ 新增 tastytrade chain metadata adapter：
  - `collector/providers/tastytrade_option_chain_provider.py`
  - `OPTION_PROVIDER=tt_internal`
  - REST endpoint：`/option-chains/{symbol}/nested`
  - 保存 expiration、strike、call/put contract symbol、call/put streamer symbol 到 `option_contract_snapshots.raw_contract`
  - `source=tt_internal`
  - `provider_status=metadata_only`
- ✅ 新增 tastytrade diagnostic：
  - `collector/debug_tastytrade_option_chain.py`
  - Command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py`
- ✅ tastytrade DXLink quote/Greeks/OI merge：
  - 获取 API quote token
  - 订阅 underlying symbol 与 option streamer symbols
  - 记录 raw `Quote` / `Trade` / `Summary` / `Greeks` / `TheoPrice` / `Profile` payload
  - 将 bid / ask / last / volume / open_interest / iv / delta / gamma / theta / vega / rho merge 到 contract snapshot
  - 将 underlying bid / ask / trade price merge 到 chain snapshot
  - 若 TT 不返回 OI 或 Greeks，明确降级：quote-only / no-gex，不进入 GEX 计算
- ✅ Runtime smoke with tastytrade：
  - Diagnostic command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python debug_tastytrade_option_chain.py`
  - Diagnostic result：PLTR chain metadata fetched；`available_expiration_count=19`、`available_strike_count=138`、`returned_contract_count=10`
  - DXLink diagnostic command：`OPTION_DEBUG_SYMBOL=PLTR OPTION_MAX_CONTRACTS=6 OPTION_MAX_STRIKES_PER_SIDE=1 TT_DXLINK_TIMEOUT=12 venv311/bin/python debug_tastytrade_dxlink.py`
  - DXLink diagnostic result：returned `Quote`、`Trade`、`Summary.openInterest`、`Greeks`、`TheoPrice`、`Profile` events for PLTR option streamer symbols
  - Collector command：`OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 venv311/bin/python collect_options.py`
  - Collector result：`snapshot_id=4`、`contracts=10`、`source=tt_internal`、`provider_status=metadata_only`
  - API verified：`/api/options/PLTR/snapshot?includeContracts=false` 返回 `freshness=fresh`、`provider_status=metadata_only`
  - Collector command after DXLink merge：`OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=10 OPTION_MAX_STRIKES_PER_SIDE=2 TT_DXLINK_TIMEOUT=12 venv311/bin/python collect_options.py`
  - Collector result after DXLink merge：`snapshot_id=6`、`contracts=10`、`source=tt_internal`、`provider_status=ok`
  - API verified after DXLink merge：`completeness_pct=100.00`、`missing_greeks_ratio=0.0000`、`missing_oi_ratio=0.0000`、`underlying_bid=133.5400`、`underlying_ask=133.6500`
  - Credential handling：使用 `.env` remember-token 正常续期；遇到 device challenge 转人工登录；secret 未写入仓库
- ✅ Gate before GEX：
  - GEX / Wall / Gamma Flip 只有在 gamma + OI completeness 达标后才计算
  - `metadata_only` snapshot 不参与 GEX
- ✅ GEX compute job：
  - 新增 `collector/compute_gex.py`
  - 只读 PostgreSQL latest option-chain snapshot，不调用 IB / tastytrade / provider
  - 写入 `gex_snapshots`
  - 写入 `gex_by_strike_snapshots`
  - Upsert by `snapshot_id`，同一 option snapshot 重算不会重复堆数据
  - Fail-closed：缺 spot、缺 gamma/OI、missing ratio 超过 `GEX_MAX_MISSING_RATIO=0.25` 时不写假 GEX
- ✅ GEX by contract：
  - call gex = `gamma * open_interest * contract_multiplier * spot^2 * 0.01`
  - put gex = `-gamma * open_interest * contract_multiplier * spot^2 * 0.01`
  - unit = `usd_delta_change_per_1pct_move`
  - Call positive / Put negative is a dealer-positioning proxy assumption, not a claim about actual dealer positions.
  - 缺 gamma 或 OI 的 contract 不参与 GEX，并计入 missing ratio
- ✅ GEX by strike：
  - `net_gex = sum(call_gex + put_gex)` by strike
  - `call_oi`, `put_oi`, `call_volume`, `put_volume` by strike
- ✅ Global GEX：
  - 跨 expiry、strike 聚合 `net_gex`
  - 输出 `positive`, `negative`, `near_zero`
- ✅ Local Gamma：
  - V1 默认使用 spot ±1%
  - Future candidates：spot ± expected move、最近 3-5 个 strikes
- ✅ Call Wall / Put Wall：
  - Call Wall：最大 call-side positive exposure 或最大 call OI strike
  - Put Wall：最大 put-side negative exposure 或最大 put OI strike
  - 同时保存 `wall_method=gex` 或 `wall_method=oi`，避免混淆 OI Wall 与 Gamma Wall
- ✅ Gamma Flip：
  - 构建 spot ±10% price grid
  - 对每个 grid price 重新计算每张期权 gamma 和 net GEX
  - flip = net GEX 穿越 0 的价格；无穿越则取 abs(net_gex) 最小点
  - 输出 `gamma_curve`, `gamma_flip`, `spot_vs_flip_distance_pct`, `gamma_regime`, `confidence`
- ✅ PCR：
  - `pcr_oi = total_put_oi / total_call_oi`
  - `pcr_volume = total_put_volume / total_call_volume`
- ✅ Max Pain：
  - V1 基于当前 selected contracts aggregate 计算单一 `max_pain`
  - Future：对每个 expiry 独立计算 nearest expiry max pain + aggregate max pain
- ✅ Confidence：
  - 根据 missing Greeks ratio、missing OI ratio、bid/ask availability、snapshot age 计算 high / medium / low
- ✅ Runtime smoke with GEX：
  - Command：`GEX_SYMBOLS=PLTR venv311/bin/python compute_gex.py`
  - Result：`gex_id=1`、`snapshot_id=6`、`global_gex=112882349.11`、`confidence=high`
  - API verified：`/api/gex/PLTR` returned `global_gex=112882349.1123`、`local_gamma=25163724.2306`、`gamma_regime=positive`、`call_wall=135`、`put_wall=135`、`max_pain=135`、`pcr_oi=0.3634`、`pcr_volume=0.4672`
  - Note：API `freshness=stale` because the source option snapshot was older than the 15-minute API freshness threshold at verification time

- ✅ GEX unit and model transparency correction：
  - `compute_gex.py` and the Gamma Flip curve both use the 1% underlying-move unit.
  - `gex_snapshots.raw_metrics` records formula, unit, move percentage, positioning model and limitation.
  - Model version is `gex-v2-1pct-positioning-proxy`; mixed-version history is not comparable.
  - `/api/options/:symbol/gex` returns `raw_metrics` for UI/data-detail disclosure.
  - Existing pre-correction GEX snapshots are not comparable and must be recomputed before deployment.
  - Recompute command：`GEX_RECOMPUTE_ALL=true GEX_SYMBOLS=<symbols> venv311/bin/python compute_gex.py`；完成后运行 `venv311/bin/python materialize_scan.py`。

**Phase 3D-4 — API Layer**
- ✅ `GET /api/options/:symbol/snapshot`
  - 返回 latest chain snapshot metadata，不返回全量 contracts unless `includeContracts=true`
- ✅ `GET /api/gex/:symbol`
  - 返回 `global_gex`, `local_gamma`, `call_wall`, `put_wall`, `gamma_flip`, `gamma_curve`, `pcr`, `max_pain`, `freshness`
- ✅ `GET /api/chain/:symbol`
  - 只读 latest snapshot；默认分页 / strike range / expiry filter
- ✅ `GET /api/status/options`
  - 返回 watchlist option-chain coverage、latest snapshot age、missing/stale symbols、provider failure count
- ✅ API 不同步调用 IB Gateway；missing/stale 只返回状态，不在用户请求里等待 provider。

**Phase 3D-5 — Frontend Integration**
- ✅ `/analyze?symbol=...` 读取 `/api/gex/:symbol`
- ✅ 若 GEX fresh：
  - 替换 mock GEX / Call Wall / Put Wall / Gamma Flip / PCR / Max Pain
  - 显示 source、snapshot time、confidence
- ✅ GEX 可用性与新鲜度分离：
  - required fields 完整时，fresh、stale 或 partial GEX 都展示实际 GEX/Wall/strikes。
  - stale/partial 显示 source、snapshot age、confidence 和质量提示，不冒充 fresh。
  - 只有 required fields 缺失时才进入 GEX unavailable，并清除 mock wall/gex/strategy legs。
- ✅ 支持 GEX-only fallback：
  - 如果 symbol 有真实 GEX + price，但暂无 `/api/metrics`，仍展示真实 GEX / Walls / PCR / Max Pain
  - IV Rank 区域显示 unavailable，不生成策略腿推荐
- ✅ UI safety fix：
  - Tab4 `Call Wall == Put Wall` 时不再出现 0-span canvas range
- ✅ **2026-07-16 real-data integrity repair**
  - 删除 `frontend/src/data/mockAnalysis.js`，`Analyze.jsx` 不再以 sample symbol 为页面基础对象。
  - 真实 price / metrics / GEX 各自独立注入；任一字段未返回时保持 `null` 或明确 unavailable，不可遗留样例价格、Wall、结论或策略腿。
  - `/api/scan` final query 将 `latest_rows.source` 显式限定，避免与 community snapshot 的 `source` 列冲突导致 PostgreSQL HTTP 500。
  - 继续限定 `latest_rows.snapshot_ts` 与 freshness CASE，避免同一 join 中 community batch 的同名 timestamp 再次触发 PostgreSQL ambiguity。
  - 回归：frontend 检查 Analyze 无 mock import/use；server scanner SQL 检查 source qualification。
  - Production smoke：2026-07-16 Railway `/api/scan?minIvr=40&maxIvr=100&limit=5` HTTP 200；Vercel `/analyze?symbol=NFLX` 显示实际 `$73.68`、Polygon price/GEX 和 $75/$73 Walls，`/scan` 显示 1,700 个实际报价候选单。
- ✅ Verification：
  - Frontend build：`npm run build`
  - Production API prepared：PLTR `snapshot_id=7`、`/api/gex/PLTR` returned `freshness=fresh`、`confidence=high`
  - Browser plugin smoke attempted but blocked by runtime setup error：`Cannot redefine property: process`
- ✅ `/scan` 新增 filters：
  - gamma regime
  - near call wall / near put wall
  - high local gamma
  - unusual OI / volume：当前实现 total OI / total volume / volume-to-OI ratio；OI delta 异常需后续连续 snapshot 历史
  - IV Rank + GEX combined scanner
  - API behavior：仍只读 latest `iv_history` / `price_history` / `gex_snapshots` / `gex_by_strike_snapshots`，不在 request path 同步调用 IB/TT/provider
  - Frontend behavior：扫描器新增 Gamma 环境、Wall 距离、Local Gamma、OI、Volume、IV+GEX 排序控件；结果列显示 GEX 状态、总 GEX、最近 wall 距离
  - Verification deferred per instruction

**✅ Phase 3D-6 — Verification（2026-07-15 完成）**
- ✅ Unit tests：GEX sign calculation、wall selection、gamma flip interpolation/nearest-zero fallback、PCR division-by-zero、confidence downgrade
- ✅ Integration tests：
  - seeded option snapshot → `/api/gex/:symbol` 返回正确字段
  - missing snapshot → `freshness=missing`
  - stale snapshot → stale response without synchronous provider call
- Verification evidence：
  - `collector/venv311/bin/python -m unittest discover -s tests -p 'test_*.py'` → 43 passed
  - `cd server && npm test` → 7 passed
  - API integration 使用 mocked PostgreSQL + refresh queue；fresh 不 enqueue，missing/stale 只 enqueue `option_chain_snapshot`，没有 provider call
  - 回归测试发现并修复 API enqueue 默认仍为 `tt_internal` 的漂移；`server/src/lib/refreshJobs.js` 现默认 `polygon_licensed`，并与 worker supported providers 对齐
- ✅ Integration / UI smoke：Polygon licensed provider 完整验证（见 Phase 3I）
- ✅ Disclosure：API 返回 `source=polygon_licensed`，区分 IB internal 研究路径

**✅ Phase 3D-7 — Production Provider Cutover（完成于 Phase 3I）**
- ✅ Selected: Polygon.io Options Starter ($29/月，含商用再分发权利，15分钟延迟)
- ✅ `collector/providers/polygon_option_chain_provider.py` 实现，source=`polygon_licensed`
- ✅ `run_refresh_worker.py` + `ecosystem.config.cjs` 已切换至 `polygon_licensed`
- ✅ IB internal 不再作为公开产品数据路径；API 返回 `source=polygon_licensed`

**Phase 3C — Cache & Freshness Architecture（真实数据源上线体验）**
- ✅ 定义 snapshot freshness policy：IV/HV daily，earnings daily，option chain 1-5min，OI daily/provider cadence，GEX/Walls/Gamma Flip 随 chain refresh，scanner 1-5min
- ✅ PostgreSQL schema：`option_chain_snapshots`、`gex_snapshots`、`symbol_metrics_snapshots`、`scanner_results_snapshots`、`provider_fetch_jobs`
  - `option_chain_snapshots` / `gex_snapshots` / `provider_fetch_jobs` 已存在
  - 新增 `symbol_metrics_snapshots`
  - 新增 `scanner_results_snapshots`
- ✅ API contract：真实数据 endpoint 返回或补充 `snapshot_ts`、`source`、`freshness`、`is_stale`、`refresh_status`
  - `/api/metrics`：保留原字段，新增 metadata
  - `/api/gex/:symbol` / `/api/chain/:symbol`：missing/stale 只 enqueue refresh，不同步调用 provider
  - `/api/scan`：读取 scanner materialized rows，并返回 freshness metadata
- ✅ `/api/gex/:symbol` 行为：fresh → 200 data；stale → 200 stale data + enqueue refresh；missing → queued 状态；不可同步等待 provider
- ✅ `/api/chain/:symbol` 行为：只读最新 provider snapshot；不从用户请求路径直连本地 Mac Studio / IB Gateway
- ✅ `/api/scan` 行为：读取 `scanner_results_snapshots` latest materialized result；不在请求时全市场重算
- ✅ `provider_fetch_jobs` worker：记录 symbol、job_type、status、attempts、last_error、created_at、started_at、finished_at
  - `collector/run_refresh_worker.py`
  - supports `symbol_metrics_snapshot`, `option_chain_snapshot`, `scanner_materialize`
  - unsupported/unconfigured licensed provider jobs fail closed with `last_error`
- ✅ Refresh rate limit：单 symbol/job/provider 至少 60 秒间隔入队；worker 记录 provider budget usage
  - `provider_request_usage` tracks provider/date/job_type request_count vs request_budget
  - 同一用户手动 refresh 限频仍待 product auth layer
- ✅ API memory cache：metrics 60s，GEX/chain 120s，scanner 60s（env 可调）
- ✅ Frontend stale-while-revalidate：当前 Analyze/Scan 在 loading 时保留已有结果；API 提供 freshness/refresh_status
- ✅ 前端状态文案：已有 GEX fresh/stale/unusable、price stale、missing data 文案；scanner rows 暴露 freshness metadata
- ✅ 缺失数据体验：不要用 mock data 伪装真实数据；missing snapshot 返回 queued/missing 状态
- ✅ 监控：provider fetch failure、stale snapshot age、job queue backlog、rate-limit hit、empty snapshot count
  - `/api/status/cache` returns job summary, recent failures, scanner stale age, empty/metadata-only option snapshot count, provider budget usage
- ✅ 回滚策略：关闭 materialize job 后 `/api/scan` 仅返回已有 snapshot；保留旧 endpoint array contract 不破坏前端

**大单 / Unusual Activity（免费方案）**
- ✅ **Phase 3E-1 OI Delta Snapshot Layer**
  - 新增 contract-level OI history / delta 表
  - 从连续 `option_contract_snapshots` 计算 OI delta
  - 输出 `symbol`, `contract_symbol`, `expiry`, `strike`, `right`, `open_interest`, `previous_open_interest`, `oi_delta`, `volume`, `volume_oi_ratio`, `snapshot_ts`, `source`
  - Fail-closed：没有 previous snapshot 时不标记 unusual，只标记 baseline
  - 不改变交易策略逻辑
- ✅ Phase 3E-2 Unusual OI scanner：
  - 按 OI delta、volume/OI、absolute volume、DTE、bid/ask completeness 过滤
  - 只读预计算 snapshot，不在用户请求时计算全链
- ✅ Phase 3E-3 `/scan` 新增过滤器：
  - Unusual OI
  - PCR 异常
  - GEX 环境组合
  - near wall + unusual OI combined signal
- ✅ Phase 3E-4 `/analyze` Unusual Activity tab/card：
  - 展示 top contracts
  - 标注 baseline / confirmed delta / stale / missing
  - 不把 volume-only proxy 写成“机构建仓确认”
- ✅ Runtime verification：
  - Migration completed against Railway PostgreSQL.
  - `venv311/bin/python materialize_oi_delta.py` wrote 10 PLTR OI delta rows, `status=confirmed`, `unusual=0`.
  - `venv311/bin/python materialize_scan.py` refreshed 67 scanner rows.
  - Local API verified：`/api/unusual/PLTR?limit=5` returned confirmed rows with `oi_delta=0`, `status=quiet`.
  - Local API verified：`/api/status/cache` returned `oi_delta.row_count=10`, `status_counts.confirmed=10`.
- ✅ Unusual Whales sweep / dark-pool 数据层（2026-07-15 代码完成）
  - ✅ WebSocket JSON adapter 使用账户下发的 URL/token/subscription payload；缺配置 disabled-safe，不猜测 broker 参数
  - ✅ 官方 `FlowAlert` 字段归一化为 option flow；仅 `TradeReport.market_center=L/2` 归一化为 TRF dark-pool event
  - ✅ `external_flow_events` 幂等持久化与 `external_flow_provider_state` provider freshness 状态
  - ✅ `GET /api/flow/:symbol` 返回 24h flow/sweep/dark-pool 汇总、事件明细及 missing/quiet/active/stale
  - ✅ Analyze 数据解读页显示真实事件；没有新鲜 provider heartbeat 时不展示推断值
  - ✅ Railway additive migration completed；只读确认两张表存在且初始 `event_count=0`
  - ✅ Mac Studio PM2 process registered/saved；disabled 状态连续 online、restart count=0、日志明确 idle
  - ✅ Tests/build：collector 95、server 62、frontend 25、full ESLint、Vite build
  - [ ] ~~提供 `UW_WS_URL`、`UW_API_TOKEN` 后完成真实 stream 验收~~ — **暂不接入**：API 订阅 $125/月，性价比低；代码已完成并保持 disabled-safe，待有付费用户现金流后再评估

**Phase 3F — Scanner UX/Data Completion**
- ✅ Scanner direction：materialized trend fields from `price_history` replace `待接入趋势`.
- ✅ Scanner earnings risk：display `earnings_date` and warn when event is within 0-14 days.
- ✅ Scanner row navigation：click row navigates directly to `/analyze?symbol=XXX&tab=0`.
- ✅ Analyze URL sync：automatic data-load URL normalization uses replace/skip when params already match, avoiding an extra `/analyze?symbol=XXX` browser-history entry.
- ✅ Scanner API cache key includes unusual/PCR filters, preventing filtered results from reusing stale cache entries from different filter combinations.
- ✅ Scanner filter UX copy：default flow uses opportunity presets; advanced filters keep English market terms with Chinese explanations for OI, Volume, Local Gamma, OI Delta, Unusual Count and Put/Call Ratio.
- ✅ Scanner universe copy：replace visible watchlist ticker chips with a data-coverage summary; document watchlist as transitional Phase 3 data pool, not final product scope.
- ✅ Scanner idle layout：before the first scan, the result hint stays beside the filter panel instead of reserving a full-width, 300px-tall empty result area.
- ✅ Scanner result hierarchy：replace the 13-column horizontal table with seven decision cells (symbol/price, volatility, trend, positioning, concrete candidate, score, earnings). The mobile view becomes a two-column row with the candidate spanning its own line; normal use no longer requires horizontal scrolling.
- ✅ ΔOI daily comparison：same-day option snapshots are not a meaningful OI baseline. The materializer compares the latest snapshot with the latest prior New York market date from the same source; without that baseline the UI says `待下一交易日`, never `0 / 0`.
- ✅ Scanner positioning copy：Wall now shows its actual strike and whether it is above or below spot; GEX now shows positive/negative Gamma, net exposure, the expected volatility tendency and snapshot freshness instead of unexplained `Call 4.5%` / `GEX -$1.1B` fragments.
- ✅ Opportunity type controls：selecting High-IV income, near Wall, or unusual positioning now has a persistent selected state and immediately reruns Scanner with the preset's explicit filters; it is no longer a silent form-state change.
- ✅ Scanner toggle alignment：Unusual OI and advanced-risk checkboxes use an explicit 16px control column with adjacent label text; browser input sizing cannot push the label across the filter panel.
- ✅ Scanner filter scrolling：the desktop sticky filter panel has its own viewport-bounded vertical scroll, so advanced controls and the scan action remain reachable after long result lists render.
- ✅ Scanner table sorting：cross-expiry candidates now have unique React keys containing every leg's expiry and contract identifier; exact duplicate candidates are removed before rendering, repeated header clicks use a tested sort-state transition, and the sorted list is remounted per sort state so rows cannot retain stale DOM positions.
- ✅ Verification：
  - Migration completed against Railway PostgreSQL after adding trend columns.
  - `venv311/bin/python materialize_scan.py` refreshed 67 scanner rows with trend fields.
  - Local API verified：`/api/scan?minIvr=0&maxIvr=100&limit=3` returned `trend_label`, `trend_score`, `trend_change_5d`, `trend_rsi14`, MA fields, and `earnings_date`.
  - Production API still requires Railway deploy to expose new `/api/scan` response fields; database rows are already materialized.

**Phase 3G — Scanner Universe Expansion**
- ✅ Replace transitional 67-symbol watchlist with persistent `symbol_universe`; seed it from the watchlist and every known price/IV/option symbol, and register valid unknown Analyze symbols on demand.
- ✅ Universe filters：
  - market cap minimum / maximum（API/UI/schema complete; populated from Polygon reference metadata when provider returns market_cap）
  - stock price range
  - underlying share volume / dollar volume
  - optionable flag（API/UI/schema complete; true only when a usable option snapshot exists; unknown stays null）
  - option chain liquidity：bid/ask spread, total OI, total volume
  - sector / ETF category（API/UI/schema complete; derived from Polygon/SEC SIC when available）
  - earnings window include/exclude
- ✅ Keep scanner materialized：`materialize_scan.py` reads the persistent universe and still writes `scanner_results_snapshots`; user requests never run full-market provider calls synchronously.
- ✅ Unknown-symbol flow：`GET /api/analyze/:symbol` registers the ticker, reports price/metrics/options/GEX coverage, and enqueues only missing price/metrics/options jobs. UI displays queued/partial/blocker state.
- ✅ Retry-loop guard：a recent non-retryable metrics failure is returned as `refresh.metrics=blocked`; repeated Analyze requests do not create duplicate jobs.
- ✅ 2026-07-15 runtime evidence：Railway migration succeeded; seed synced 77 symbols; COST on-demand registration expanded the universe to 78; COST obtained Polygon daily/30M price, a 54-contract option snapshot, fresh GEX and $925/$910 walls. TT metrics remain a field-specific manual-login blocker and do not suppress the available products.
- ✅ 2026-07-16 reference metadata completion：
  - `collector/providers/polygon_reference_provider.py` reads Polygon `/v3/reference/tickers/{symbol}` for ticker name, type, market cap and SIC metadata.
  - `collector/collect_universe_metadata.py` updates `symbol_universe` without overwriting manually maintained non-reference fields.
  - Sector/category is `sec_sic_derived_v1`; this is a deterministic derived label, not a provider-native sector.
  - `optionable=true` is set only from persisted usable option snapshots (`contract_count > 0` and not `empty`/`metadata_only`); missing evidence remains null.
  - Railway runtime：78 active/scan-enabled symbols, 77 reference rows written, 1 missing (`VIX`), 0 failed；coverage after materialization：market_cap 27、sector 28、optionable true 69。
  - PM2 `quantrift-universe-metadata` registered/saved as a Sunday 12:15 one-shot cron; stopped between runs with cron still active.

**Phase 3H — Contract-Level Scanner Filters**
- ✅ Add optional advanced filters for contract-level strategy inputs：
  - DTE min/max
  - absolute Delta min/max
  - max bid/ask spread percentage
  - per-contract minimum OI
  - per-contract minimum volume
- ✅ Backend behavior：blank values do not filter; provided values require at least one latest option contract snapshot matching the constraints.
- ✅ Scanner result display：不再把 DTE range / quoted contract count 当作用户结果；这些仅保留为采集诊断。用户结果显示被选中候选单的 expiry、DTE、实际 legs、credit/debit、max loss、breakeven、return on risk、spread 与最低 OI。
- ✅ Data source：current `option_contract_snapshots` already stores expiry, bid, ask, volume, open_interest, IV and Greeks from IB/TT transitional adapters.
- ✅ Product boundary：these filters are optional advanced controls; default scanner presets should work without the user understanding Greeks.
- ✅ Strategy parameter presets：
  - 不限：不按合约参数过滤
  - 保守：DTE 30-60, Abs Delta 0.10-0.20, Max Spread 10%, Contract OI >= 500, Contract Vol >= 50
  - 标准：DTE 30-60, Abs Delta 0.16-0.30, Max Spread 15%, Contract OI >= 100, Contract Vol >= 10
  - 进取：DTE 7-45, Abs Delta 0.25-0.40, Max Spread 20%, Contract OI >= 50, Contract Vol >= 5
  - 短线：DTE 1-14, Abs Delta 0.20-0.40, Max Spread 20%, Contract OI >= 100, Contract Vol >= 20
  - 流动性优先：DTE 7-60, Abs Delta 0.05-0.50, Max Spread 8%, Contract OI >= 1000, Contract Vol >= 100
- ✅ Advanced edits mark the strategy parameter profile as custom.
- ✅ Default scanner profile is `不限`：不施加隐藏 preset，枚举当前 snapshot 1-90 DTE 范围内所有已支持策略及所有通过 Delta、spread、OI、volume 与经济性门槛的候选单；同一标的可返回多条不同策略/expiry/strikes。用户可多选策略或选择保守 / 标准 / 进取 / 短线 / 流动性优先收窄结果。
- ✅ Scanner table UX：
  - each visible column header is sortable
  - `OI Δ` renamed to `ΔOI`
  - duplicate `价格` status column removed; raw price freshness is internal state and not useful as a scanner column
  - strategy column shows a concrete action summary, e.g. Bear Call Spread = sell lower-strike call and buy higher-strike call
  - missing GEX/Wall/OI/contract values display as user-facing status instead of raw `missing`; contract data displays `待采集` when no latest option contract snapshot exists
  - automatic option-chain refresh jobs default to `polygon_licensed`，并由跨 server/collector contract tests 保证 worker 可执行
- ✅ Refresh provider regression tests：
  - Server `npm test` asserts the default option-chain refresh provider is executable by the worker and does not silently fall back to a placeholder provider.
  - Collector unittest asserts worker-supported option providers include `tt_internal` and exclude `licensed_options_provider`.
- ✅ Fix option-chain collector persistence scope：
  - default DTE selection now uses buckets `0-14,30-60,60-90` instead of a single 7-60 window.
  - `OPTION_MAX_CONTRACTS_PER_EXPIRATION` prevents the first selected expiration from consuming the full `OPTION_MAX_CONTRACTS` cap.
  - TT provider has unittest coverage proving multiple expiration buckets persist contracts instead of only the first expiration.
  - IB provider uses the same DTE bucket and per-expiration cap semantics.
  - Runtime verified on PLTR：`OPTION_PROVIDER=tt_internal OPTION_SYMBOLS=PLTR OPTION_MAX_CONTRACTS=60 OPTION_MAX_CONTRACTS_PER_EXPIRATION=20 OPTION_MAX_STRIKES_PER_SIDE=3 TT_DXLINK_TIMEOUT=12 venv311/bin/python collect_options.py` wrote `snapshot_id=9`, 28 contracts across 2/30/65 DTE, with 28 quoted contracts, 28 Greeks rows and 28 OI rows.
  - Runtime verified downstream：`compute_gex.py` wrote `gex_id=4`, `materialize_oi_delta.py` wrote 28 OI delta rows, and full `materialize_scan.py` restored 67 scanner rows with PLTR `gex_status=fresh`, `call_wall=140`, `put_wall=140`, DTE range 2-65.
- ✅ Expand option-chain snapshot backfill from PLTR-only to the scanner ingestion pool in bounded batches：`run_collector_daemon.py` + `schedule_option_refresh.py` 持续 enqueue missing/stale symbols，worker 后续运行 GEX、OI delta 与 scanner materialization
- ✅ Scanner strategy recommendation expansion（由 Phase 3H-1/3H-2 与 P1.1 完成）：
  - Current recommendation engine emits `Bull Put Spread`, `Bear Call Spread`, `Iron Condor`, `Long Straddle`, and fallback `Bull Call Spread` / `Short Strangle` labels.
  - Strategy knowledge base already contains `Short Put`, `Short Call`, `Iron Butterfly`, `Long Call Butterfly`, `Long Put Butterfly`, `Short Butterfly`, and related structures.
  - Add explicit recommendation candidates for naked sell put / naked sell call only behind a risk-defined suitability gate; default beginner flow should prefer defined-risk put spread / call spread.
  - Add butterfly candidates for pinning / low realized move / price-near-body scenarios after contract-level chain selection is available.
- ✅ Scanner concrete setup display：
  - Historical implementation initially returned latest quoted option contracts for each symbol and built concrete legs in the frontend.
  - Current implementation (V3A immediate core, 2026-07-16) builds concrete legs in the backend candidate engine and returns only `concrete_setup` DTOs.
  - Scanner strategy column now shows legs, DTE, credit/debit estimate, max-loss / breakeven where available.
  - If the current snapshot cannot form the strategy, the row says the contract snapshot is insufficient instead of showing only a strategy name.
- ✅ **Phase 3H-1 — Actionable scanner candidate selector (`SCAN-ACTIONABILITY-001`, 2026-07-15)**
  - Severity：P1；confidence：high。
  - Confirmed from code：旧 UI 把 snapshot inventory 的 `DTE 2-65` 显示成“合约结果”，并按第一个可用 expiry 构造 legs；固定 `POP 64/66%` 不是由实际合约价格计算。
  - Trigger：同一 symbol snapshot 同时含短期和中期 expiry，例如 2/30/65 DTE。
  - Current behavior：用户只能看到库存跨度或策略名称，无法知道哪一笔订单值得研究；算法可能因排序选择 2 DTE。
  - Expected behavior：只输出可由同 expiry 真实 bid/ask contracts 组成、通过流动性与经济性门槛的候选单。
  - Worst consequence：把库存元数据误认为推荐期限，或展示无法成交、负 credit、风险收益不合理的结构。
  - Initial implementation：前端 `scanOpportunity.js` 曾枚举 actual contracts；最初默认 21-60 DTE，随后由 Phase 3H-2 修正为“不限不施加隐藏 preset”。V3A immediate core 已将同一算法迁到 `server/src/domain/scanner/candidateEngine.cjs` 并删除前端文件；credit spread 要求 `short bid - long ask > 0`；Iron Condor 两侧必须同 expiry；按 DTE fit、short Delta、bid/ask spread、OI、volume、RoR/economics 计算 0-100 机会分，并要求至少 50 分。
  - UI：`合约` 改为 `机会质量`，`推荐策略` 改为 `候选单`，删除规则占位 `POP`，改为 `机会分`；显示 expiry/DTE、具体 legs、净 credit/debit、max loss、breakeven、RoR、最低 OI 与平均 spread。
  - Changed business behavior：改变 scanner 研究候选输出与排序/过滤，不修改任何自动交易、下单或持仓逻辑。
  - Tests：`server/test/candidateEngine.test.js` 覆盖忽略 2 DTE、拒绝负 credit、短线允许 2 DTE、Iron Condor 同 expiry、跨期结构与高级风险 gate；`server/test/scanRoute.test.js` 断言响应不含 `option_contracts`。
  - Runtime evidence：用 2026-07-15 production `/api/scan` 63 rows 离线运行 selector，得到 3 个完整候选：GOOGL 30 DTE Iron Condor、CIBR 37 DTE Bull Put Spread、IBB 37 DTE Long Straddle；其余 rows 因无法组成完整且达标的真实 legs 被排除。
  - Done：初始前端实现完成，后续由 V3A immediate core 迁移为后端 API 契约；未改变 collector 或数据库 schema。
  - Rollback：回滚 V3A commit `9fd90e9` 可恢复此前 API/前端实现；不需要数据回滚。
- ✅ **Phase 3H-2 — `不限` 枚举全部达标候选（2026-07-15）**
  - Confirmed bug：Phase 3H-1 仍先按 IV/trend 为每个 symbol 指定一个策略，再只返回该策略的最佳 setup；这不符合“不限”。
  - Behavior：`不限` 对 `Iron Condor`、`Bull Put Spread`、`Bear Call Spread`、`Long Straddle` 枚举全部达标组合；同一 symbol 可以出现多行。策略 chips 只显示当前真正支持自动选腿的结构，多选后作为显式过滤。
  - Guardrail：这里的“全部”指全部通过可执行性和机会分门槛的候选，不包含负 credit、缺腿、跨 expiry、过宽 spread 或低于 50 分的排列。
  - Tests：新增 regression test，确认同一 symbol 在不限模式同时返回 Bull Put Spread、Bear Call Spread 和 Iron Condor，而不是只返回一条。
  - Runtime evidence：当前 Railway snapshot 63 symbols 产生 210 个达标候选、覆盖 15 symbols；结构分布为 Bull Put Spread 38、Bear Call Spread 45、Iron Condor 70、Long Straddle 57，DTE 覆盖 2/30/37/65。
- ✅ Analyze mock-data leakage fix：
  - PLTR showed fake `Call Wall $595 / Put Wall $575` because Analyze initialized from `mockAnalysis` and kept mock walls when real GEX was unavailable; the old contract construction path could also create invalid option combinations.
  - GEX missing/unusable now marks the result partial and clears `callWall`, `putWall`, GEX strikes, scenarios and recommendation so mock walls cannot appear as real data. Stale/partial snapshots with required fields remain visible with quality labels.
  - API failure no longer falls back to local mock structures for a typed symbol.
- ✅ Analyze GEX regression tests：
  - Frontend `npm test` covers stale GEX, missing GEX, and fresh usable GEX merge behavior.
  - Stale/missing GEX clears mock walls, scenarios and recommendations instead of leaking local mock strategy output.
- ✅ Collector option-chain coverage fix：
  - Confirmed from Railway DB on 2026-07-15：`price_history` had 67 symbols and `iv_history` had 76 symbols, but `option_chain_snapshots` / `gex_snapshots` only covered PLTR before the fix.
  - Root cause：`collect_options.py` defaulted to `AAPL,SPY,QQQ,PLTR` instead of `watchlist.txt`; queue worker jobs were also vulnerable to stale `running` states when provider auth exited the process.
  - `collect_options.py` now defaults to `watchlist.txt`; `OPTION_SYMBOLS` / `SYMBOLS` still provide targeted backfill overrides, and `watchlist` / `all` aliases explicitly select the full watchlist.
  - `run_refresh_worker.py` now recovers stale `running` jobs, treats unsupported provider names as non-retryable, converts TT auth `SystemExit` into catchable errors, blocks repeated TT auth attempts within the same worker run, and falls back from `tt_internal` to `ib_internal` for option-chain jobs when TT auth is unavailable.
  - `server/src/lib/refreshJobs.js` now rejects malformed ticker symbols before inserting `provider_fetch_jobs`; internal `__SCAN__` is allowed only for `scanner_materialize`.
  - Analyze ticker input now handles IME composition safely: it does not force uppercase while Chinese input composition is active, normalizes only on composition end / submit, and rejects malformed artifacts such as `SS'TS'T'XSTX`.
  - Runtime DB after recovery：option-chain/GEX snapshots exist for PLTR, QQQ and KLAC. STX and TSLA were backfilled through IB Gateway on `127.0.0.1:4001` and wrote `snapshot_id=14` / `snapshot_id=15`, each with 54 contracts.
  - STX/TSLA IB result：`provider_status=partial`, `completeness_pct=0.00`, `missing_greeks_ratio=1.0000`, `missing_oi_ratio=1.0000`; GEX/Wall was correctly not generated because IB did not return bid/ask, Greeks or OI for those option snapshots.
  - OI delta materialization now ignores IB rows where `contract_symbol` is only the underlying ticker and falls back to expiry/strike/right keys; STX/TSLA wrote 54 `missing_oi` rows each instead of failing on duplicate conflict.
  - Verification：collector unittest passed 15 tests; server `npm test` passed 4 tests; frontend `npm test` passed 5 tests; frontend `npm run build` passed; `git diff --check` passed.
- ✅ **Phase 3D-2B — 修复 IB 实链采集、持久化和本机直接运行（2026-07-15）**
  - Finding ID：`DATA-IB-CONTRACT-001`
  - Confirmed bug：旧 provider 将 `reqSecDefOptParams` 的全局 expirations 和 strikes 做组合，可能请求并持久化实际不存在的 option contract。
  - Exact code path：`run_refresh_worker.py` → `collect_options.py` → `IbOptionChainProvider.fetch_snapshot()` → contract discovery → `persist_snapshot()` → GEX/OI delta/scanner materialization。
  - Trigger：任意 symbol 的合法 expiry 集合与 strike 集合并非一一对应；本地组合后 IB resolution 结果不完整或错误。
  - Worst consequence：错误 strike/expiry/right 进入 snapshot，产生与 underlying 完全不相干的 Wall、GEX 和策略腿。
  - Implemented behavior：
    - `reqSecDefOptParams` 只用于选择 bounded expirations。
    - 每个 `expiry + CALL/PUT` 使用无 strike 的 `reqContractDetails` 请求实际 contract definitions。
    - 只接受 IB 返回、`conId > 0`、expiry/right 精确匹配的 contract。
    - 按真实 contract 的 strike 距 spot 排序和截断；不生成任何缺失组合。
    - 历史实现曾默认 `IB_MARKET_DATA_TYPE=3` 接受 delayed quote/Greeks/OI；自 2026-07-19 的 IB 订阅启用后，PM2 当前设为实时类型 `1`。
  - Persistence invariants：
    - `option_contract_snapshots.con_id` 必须来自 IB actual contract details。
    - 同一采集结果按 `conId` 去重。
    - `raw_metadata.discovered_contract_count` 和 `selected_contract_count` 记录发现与持久化数量。
    - partial field coverage 可以持久化并降低 completeness；不存在的 contract 不能持久化。
  - Runtime simplification：
    - 新增 `collector/run_collector_daemon.py`，每 60 秒消费 refresh jobs、每 300 秒 materialize scanner。
    - 新增 `collector/schedule_option_refresh.py`：每 300 秒从 watchlist 选择最多 2 个 missing/old symbols；missing 优先、stale 按最旧优先；queued/running 或 30 分钟内尝试过的 symbol 跳过。
    - 自动任务以 `tt_internal` 入队；TT auth/network unavailable 时由同一 worker fallback 到 `ib_internal`，不重复创建 provider session storm。
    - 新增 `collector/ecosystem.config.cjs`；PM2 直接运行当前 repo 和 repo `venv311`。
    - 删除 repo LaunchAgent plist/wrappers；停止旧 LaunchAgent；删除 `~/.quantrift_options_collector` 运行副本。
    - 不需要 sync；修改当前 repo 后重启 PM2 即加载当前代码。
  - UI behavior：stale/partial 但 required fields 完整的 GEX/Wall 保留显示，并标记 age/confidence；missing required fields 才隐藏分析。
  - Files changed：
    - `collector/providers/ib_option_chain_provider.py`
    - `collector/run_collector_daemon.py`
    - `collector/ecosystem.config.cjs`
    - `collector/.env.example`
    - `collector/tests/test_option_provider_selection.py`
    - `frontend/src/lib/analyzeData.js`
    - `frontend/src/pages/Analyze.jsx`
    - `frontend/src/lib/analyzeData.test.js`
    - 删除旧 `collector/com.quantrift.collect-prices.plist`、`collector/run_collect_prices.sh`
  - Tests required and executed：
    - `cd collector && venv311/bin/python -m unittest discover -s tests` → 37 passed（含 missing-first、fresh/recent skip、oldest-stale-first scheduler tests）。
    - `cd server && npm test` → 4 passed。
    - `cd frontend && npm test` → 6 passed。
    - `cd frontend && npm run build` → passed；仅保留既有 chunk-size warning。
  - Live IB evidence：
    - Command：`OPTION_PROVIDER=ib_internal OPTION_SYMBOLS=NBIS IB_HOST=127.0.0.1 IB_PORT=4001 IB_OPTION_CLIENT_ID=48 IB_MARKET_DATA_TYPE=3 IB_TIMEOUT=15 IB_OPTION_STREAM_TIMEOUT=4 OPTION_MAX_CONTRACTS=36 OPTION_MAX_CONTRACTS_PER_EXPIRATION=12 OPTION_MAX_STRIKES_PER_SIDE=2 OPTION_DTE_BUCKETS=0-14,30-60,60-90 venv311/bin/python collect_options.py`
    - Result：`snapshot_id=33`，IB discovered 456 actual contracts，selected/persisted 30。
    - DB：30 rows、30 distinct `conId`、0 null/zero `conId`、0 null `localSymbol`、Greeks missing 0%、OI missing 3.33%、completeness 98.33%。
    - `OPTION_SYMBOLS=NBIS venv311/bin/python compute_gex.py` → `gex_id=15`、`global_gex=-449311853.73`、`confidence=high`。
    - OI delta materialization wrote 30 rows；scanner materialization wrote 67 rows。
  - Runtime evidence：`quantrift-options-collector` PM2 process online；log recorded `No queued refresh jobs` and `Materialized 67 scanner rows`。
  - Price runtime evidence：`quantrift-options-prices` one-shot completed `4020 rows written, 0 failed` and returned to `stopped`; PM2 cron schedule will restart it at the next configured run。
  - PM2 persistence：`pm2 save` completed and wrote `/Users/congrenhan/.pm2/dump.pm2`。
  - Auto-refresh runtime evidence：scheduler selected AAPL；TT returned `device_challenge_required` once，worker immediately used IB fallback；IB delayed collection completed AAPL with 78 actual contracts、completeness 94.87%、Greeks missing 0%、OI missing 10.26%。Production `/api/status/options` increased from 8/67 to 9/67 covered，then PM2 continued with AIQ。
  - Strategy behavior change：无。修复的是 contract identity 和数据可用性；未改变 entry/exit、position size、strategy parameters 或 order behavior。
  - Rollback：`pm2 delete quantrift-options-collector quantrift-options-prices` 停止新 runtime；代码使用后续 commit 的 revert 回退。数据库 snapshot 为 append-only，本任务没有破坏性 schema migration。
  - Done：实现、单元测试、前端测试/build、真实 IB 采集、数据库 identity/completeness、GEX/OI delta/scanner 下游闭环均已验证。
- ✅ 按 bounded batches 自动扩展完整 scanner ingestion pool：PM2 scheduler/worker 已运行并持续补 missing/stale snapshots。
- ✅ 增加 collector coverage/failure alert（2026-07-15）：
  - `collector/check_collector_health.py` 每轮计算 covered_count/coverage_pct、24h failed_count、snapshot age、completeness
  - 阈值由 `HEALTH_MIN_COVERAGE_PCT`、`HEALTH_MAX_FAILED_24H`、`HEALTH_MAX_SNAPSHOT_AGE_MINUTES`、`HEALTH_MIN_COMPLETENESS_PCT` 配置
  - `collector_health_alerts` 保存 fingerprint、active/resolved、last_seen、last_notified；`HEALTH_ALERT_COOLDOWN_MINUTES` 防止重复轰炸
  - `collector/operator_alerts.py` 支持 webhook、SMTP；未配置外部 channel 时结构化 log，不假装发送成功
  - daemon 默认每 300 秒运行，可用 `COLLECTOR_HEALTH_CHECK_ENABLED=false` 回滚关闭
  - Tests：collector 49 tests passed；覆盖 healthy、coverage、failed jobs、stale、completeness、metadata-only、cooldown/fingerprint、log fallback、PM2 wiring
  - Migration：Railway `collector_health_alerts` 表已创建
  - Runtime：67 expected / 67 covered / 0 stale / 0 incomplete；24h historical failed jobs=31 触发 1 个 active critical alert；第二次运行 `notify=False`，证明 cooldown dedupe 生效
  - 外部通知：当前 SMTP/webhook 均未配置，因此 runtime 只写 PM2 log；配置 secret 后无需改代码

---

## ✅ Phase 3I — Polygon Licensed Provider（2026-07-15 完成）

> 目的：将 option chain 数据源从 `ib_internal`（仅内部研究，不可商用分发）切换为 Polygon.io 授权商用数据，解锁 SaaS 分发权利。

### 订阅
- ✅ 订阅 Polygon.io Options Starter，$29/月（实际价格；含实时+历史期权链、OI、volume、gamma、delta、IV、bid/ask；商用再分发条款明确）

### Polygon API 字段确认
- ✅ `GET /v3/snapshot/options/{symbol}`：分页，服务端过滤 `expiration_date.gte/lte` + `strike_price.gte/lte`
  - `implied_volatility`：decimal（0.337 = 33.7%），不是百分比
  - `greeks{}`：`delta`, `gamma`, `theta`, `vega`
  - `last_quote{}`：`bid`, `ask`（EOD 后可能为 None）
  - `day{}`：`volume`, `last_price`
  - `open_interest`
  - `next_url`：分页续页 URL（后续请求必须 `params=None`，URL 已 encode）
- ✅ `GET /v2/aggs/ticker/{symbol}/prev`：前一交易日收盘价作为 spot

### 新增 collector/providers/polygon_option_chain_provider.py
- ✅ `source = 'polygon_licensed'`
- ✅ `fetch_underlying(symbol)`：`/v2/aggs/ticker/{symbol}/prev` → `UnderlyingSnapshot`
- ✅ `fetch_option_chain(symbol)`：分页 `/v3/snapshot/options/{symbol}`，server-side DTE/strike 过滤
- ✅ `_parse_contract()`：映射 Polygon 字段到 `OptionContractSnapshot`；`right = 'C' if contract_type == 'call' else 'P'`；`contract_symbol = '{symbol}-{expiry:%Y%m%d}-{right}-{strike:g}'`
- ✅ `_apply_strike_limit()`：按 `(expiry, right)` 分组，保留最靠近 spot 的 `max_strikes_per_side` 个合约
- ✅ `next_url` 分页：首页带 query params，续页 URL 直接使用（params=None）

### collect_options.py
- ✅ 新增 `PolygonOptionChainProvider` import 和 `make_provider()` case：`OPTION_PROVIDER == 'polygon_licensed'`

### run_refresh_worker.py
- ✅ `SUPPORTED_OPTION_PROVIDERS` 加入 `'polygon_licensed'`（之前遗漏导致 `unsupported option provider for worker: polygon_licensed` 错误）
- ✅ `DEFAULT_OPTION_FALLBACK_PROVIDERS` 当前为 `'ib_internal'`：当 `require_quotes` 的 Polygon 快照没有有效 bid/ask 时，worker 尝试 IB，避免无报价链被误判为策略候选可用。

### ecosystem.config.cjs
- ✅ `OPTION_REFRESH_PROVIDER: 'polygon_licensed'`
- ✅ `POLYGON_API_KEY` 不写入 `ecosystem.config.cjs` 或 Git；collector 由工作目录 `.env` 读取。也不能注入空字符串，否则会阻断 `load_dotenv`。
- [ ] Rotate 曾进入 Git 历史的 Polygon key，并只写入 Mac Studio `collector/.env` / 部署平台 secret store（需要账户持有人操作）。

### PM2 部署与验证
- ✅ `pm2 reload ecosystem.config.cjs --update-env`（必须用 reload；`pm2 restart --update-env` 只合并 shell env，不重读 .cjs 文件）
- ✅ PM2 全路径：`/opt/homebrew/bin/pm2`（via SSH 时 zsh 找不到 pm2）
- ✅ option_chain_snapshot jobs succeeded（job 154/156/157）；source 从 `ib_internal` 逐渐切换为 `polygon_licensed`
- ✅ MD5 checksum 验证：local 与 Mac Studio 上 4 个改动文件完全一致
- ✅ Railway `quantrift-metrics-cron` 已配置服务级 `POLYGON_API_KEY` 并完成 2026-07-17 云端验收：2 个真实 `option_chain_snapshot` job 成功、写入 4,826 条 OI delta、物化 80 条 scanner rows。变量变更必须先 deploy 再手动运行 cron；缺 key 时 provider construction 会失败并误触 TT fallback。

### Polygon 数据延迟说明（纠正）
- Polygon $29/mo Options Starter 是 **15分钟延迟**，不是 EOD
- 盘中也能拿到 snapshot（延迟15分钟），数据源没有问题
- 限制在我们这边：collector 当前 cron 每天只跑一次（收盘后13:35 PT）
- 若需盘中信号（如30分钟级 breakout），需改调度为每30分钟跑一次 collect，不需要换数据源
- Polygon Stocks 订阅（分钟级聚合）和 Options 订阅是两个独立产品；当前 $29 Options 计划附带日线股价聚合，但不含分钟级股价

---

## 📋 Phase 3J — 功能对标、竞品分析与下一步路线图

### 竞品分析（2026-07-15）

**AlphaStock Pro Elite**
- 核心能力：多时框动量评分（30M/1D/1W）、综合 momentum score、"Uptrend"/"30min Breakout"信号矩阵
- 数据源：无期权数据，纯股票技术面
- 我们的差异化优势：GEX/PCR/Unusual OI/具体期权腿推荐 是 AlphaStock Pro 完全没有的；多时框动量评分我们可以用 `price_history` 复刻
- ✅ Composite Momentum：真实 regular-session 30M / 1D / weekly-aggregated 1W 按 30% / 40% / 30% 加权；任一历史不足 missing，30M market date 落后日线时 stale，不作为当前多周期确认（2026-07-15）
- ✅ Focus Score：MA20/50/200、RSI14、5日动量与 RVol 已实现

**Newshock.net（PRESSURE/S/R system）**
- 核心能力：每日更新支撑/阻力区间（S/R zones），从 OHLCV pivot 计算；Focus Score = MA 位置 + 量能参与度
- 数据：纯 OHLCV 历史（我们的 `price_history` 完全够用）
- 可自建：pivot-based S/R → `GET /api/sr/:symbol`；Focus Score → 复合技术评分；无需付费或爬虫
- 直接竞品差距：Newshock 无期权层，我们加上 GEX/Wall 后做出完整的"价格结构 + 期权仓位"分析

**华尔街咖啡馆参考产品**（实现对标）
- IV Skew、Term Structure 与真实 OI by strike 均已由 Polygon snapshot 接入 `/api/chain/stats`；剩余差距转向历史深度和用户分层
- 我们额外实现的：Gamma Flip 具体价位、Local Gamma 集中度、每日 OI Delta 异动、SaaS 可部署架构

---

### 实施优先级（执行顺序，2026-07-15）

下面的顺序是从本节起完成所有未完成任务的依赖图，不按文档原有出现顺序盲目执行。每个 section 必须独立完成实现、测试、文档、commit 和 push。

| 顺序 | Section | 完成条件 | 外部阻塞 |
|---|---|---|---|
| P0.0 | 凭据与任务校准 | 仓库无明文 key；过期 task 与真实代码状态一致 | 已暴露的 Polygon key 需人工 rotate，但不阻塞本地实现 |
| P0.1 | Phase 3D-6 计算/API 回归测试 | GEX sign、walls、gamma flip、PCR、confidence 及 fresh/stale/missing API tests 全通过 | 无 |
| P0.2 | Collector coverage/failure alert | coverage、failure、age、completeness 阈值可配置并有 operator alert + tests | SMTP/通知凭据仅影响真实发送验证 |
| P0.3 | Polygon price history | 日线与 30M adapter、schema、collector、PM2 调度、67 symbols runtime verification | 使用现有 Polygon key；若 rotate 后未提供新 key 才阻塞 |
| P0.4 | 自算 HV / ATM IV / IV Rank | ✅ 2026-07-15 完成：派生脚本、历史门槛、对比报告、来源切换与 fail-closed readiness | 252 个独立交易日尚未积累，因此 IV Rank 暂继续使用 TT 冷启动值 |
| P1.1 | Scanner 策略扩展 | ✅ 2026-07-15 完成：13 种结构按真实合约枚举、quote snapshot 分层、风险门控、测试和 UI 输出 | 无 |
| P1.2 | Analyze 数据产品 | ✅ 2026-07-15 完成：S/R、Focus Score、VRP、Gamma Flip、Local Gamma、chain stats 接入 | 无 |
| P1.3 | Universe / on-demand | ✅ 2026-07-16 完成：persistent universe、filters、reference metadata population、unknown symbol enqueue/wait/blocker UI、materialized invariant | TT metrics 当前需 manual login；`VIX` 无 Polygon ticker reference |
| P1.4 | Market/weekly signals | ✅ 2026-07-15 完成：SPY/QQQ regime header、30M breakout freshness gate、Weekly GEX/Max Pain/ΔOI 实数接入 | 30M 最新运行数据为前一交易日，当前正确标记 stale，不生成 breakout |
| P2.1 | 产品入口 | ✅ 2026-07-15 完成：真实产品视觉、live regime、三条核心 workflow、mobile layout | Browser plugin 初始化错误导致无自动 screenshot |
| P2.2 | Scanner alerts | ✅ 2026-07-15 完成：subscriptions、rules、token unsubscribe、dedupe delivery、PM2 evaluator、Email/Web Push adapters | SMTP/VAPID secrets 尚未配置，真实收件验收需人工提供 |
| P2.3 | Heartbeat | ✅ 2026-07-15 完成：Mac Studio daemon 上报、Railway status API、missing/offline incident、cooldown 与 resolved lifecycle | Railway/Mac 共享 token 和 webhook secret 尚需人工配置；当前 daemon disabled-safe |
| P2.4 | Frontend verification debt | ✅ 2026-07-15 完成：全量 ESLint 0 errors/0 warnings、frontend 21/21、production build | 无 |
| P2.5 | Reddit community trends | ✅ 2026-07-15 代码/表/API/UI/PM2 完成；缺凭据时 disabled-safe | Reddit OAuth app credentials 与访问 approval |
| P2.6 | Composite momentum | ✅ 2026-07-15 完成：30M/1D/1W score、freshness gate、Analyze UI | 无 |
| P2.7 | Universe reference metadata | ✅ 2026-07-16 完成：Polygon ticker reference adapter、weekly PM2 one-shot、Railway coverage verification、scanner re-materialization | `VIX` reference missing；market cap/SIC 是 provider availability 问题 |
| P2.8 | Data refresh throughput / concurrency | 未完成：把 78-symbol 线性补数据改为优先级队列 + bounded 并发 worker + shared provider limiter + stale-while-refresh UX | 需要验证 Polygon/DB 实际吞吐；不需要用户提供新 key |
| P3 | 商业化 | auth、subscriptions、positions、portfolio、Stripe | Clerk/NextAuth/Stripe key 与产品方案需人工提供/确认 |
| External | 硬件与账户验收 | UPS、IB cloud/VPS、Reddit API | 数据层代码已完成；真实运行必须人工采购、登录或提供 API key |
| 暂缓 | Unusual Whales | 代码 disabled-safe，等待正向现金流 | API $125/月，暂不订阅 |

P1.4 verification：server 31/31 tests、frontend 19/19 tests、affected frontend lint 0 errors、Vite production build passed。Railway runtime 返回 Market `Mixed 51`，SPY/QQQ 30M 因 7/14 对 7/15 daily 正确标记 stale；AAPL Weekly 返回 5 candles、1 个已有 GEX day、Max Pain 310、1 个 ΔOI day。Browser plugin 初始化报 `Cannot redefine property: process`，因此未取得自动 screenshot，未宣称 visual verification。

P2.6 verification：Railway 只读重放 AAPL 250 daily + 200 regular-session 30M rows，输出 composite=84、30M=50、1D=100、1W=95；daily 2026-07-15 对 intraday 2026-07-14，因此按设计返回 `stale`。Collector 95/95、server 65/65、frontend 25/25、full ESLint 和 Vite production build passed。

执行边界：`task.md` 中已经被后续 section 实现但仍保留 `[ ]` 的旧条目，先用代码和测试证据校准为完成；硬件采购和第三方账户操作不得伪装为代码完成。

**P4 — 量价分析（自有数据，0 增量成本）**

> 数据来源：`price_history`（日线）+ `price_history_30m`（30M）；无需新订阅。
> Unusual Whales 暂不接入（API $125/月），OI Delta 异动已覆盖期权层异常检测。

- ✅ **Volume Profile**（2026-07-16）：从 `price_history_30m` 按价格区间聚合成交量，返回 VP by price level
  - `GET /api/vp/:symbol?interval=30m&days=20&bins=40`；`days=1..60`、`bins=10..80`，仅取 regular-session 30M bars
  - 每根 bar 用 `(high + low + close) / 3` 归入价格桶并累加真实 volume；返回完整 nodes 与前 5 个 high-volume nodes
  - Analyze Tab2 显示横向 volume bars、成交量、相对现价距离；无至少两根有 volume 的 bar 或无价格区间时明确返回 `missing`，不显示模拟节点
  - 可与 S/R zones 并列用于确认成交密集价位，但不把 volume node 冒充为 S/R 或期权 Wall
  - 验证：server 69/69、frontend 40/40、full ESLint、Vite production build passed
- ✅ **OBV（On-Balance Volume）**（2026-07-16）：从 `price_history` 日线计算累计量价关系
  - `GET /api/sr/:symbol` 的 `obv` 字段返回每日累计序列、最新值、20 日变化和 `inflow` / `outflow` / `flat`
  - 公式：上涨日加 volume，下跌日减 volume，收平不变；至少需两根有真实 volume 的日线，否则 `missing`
  - 前端：Analyze Tab2 趋势图下方独立小图；不与价格轴混用
  - 验证：server 70/70、frontend 40/40、full ESLint、Vite production build passed
- ✅ **MFI（Money Flow Index）**（2026-07-16）：OHLCV + volume 14日窗口，0-100 超买超卖
  - `GET /api/sr/:symbol` 的 `mfi` 字段以近 14 个典型价变化计算正/负 money flow；至少需 15 根有效日线
  - `MFI = 100 - 100 / (1 + positive_flow / negative_flow)`；`>=80` 为 overbought，`<=20` 为 oversold，其余 neutral
  - 与 RSI 并列但不合成单一信号：RSI 表示价格动量，MFI 用价格和成交量确认资金流方向
  - 前端：Analyze Tab1 指标卡，与 Focus Score 并列；历史不足显示 `--`
  - 验证：server 71/71、frontend 40/40、full ESLint、Vite production build passed

P2.3 verification：server 39/39 tests、collector 78/78 tests、Railway additive migration passed。Runtime smoke 依次确认 expected node 从未上报时 `missing/degraded`、错误 token 为 HTTP 401、正确上报后 `online/ok`；受控 stale heartbeat 生成 `active` incident（无 webhook 时 channel=`blocked`），恢复 heartbeat 后 incident=`resolved`。Mac Studio PM2 collector 已重启并保持 online；因共享 `HEARTBEAT_TOKEN`/URL 尚未写入双方运行环境，定时上报当前按设计返回 `disabled`，不影响 collector 主循环。

**P2.8 — Data refresh throughput / concurrency（未完成，2026-07-16 讨论定稿）**

目标：把当前“每 5 分钟最多挑 2 个 symbol、worker 顺序处理”的 78-symbol 采集方式，升级成可扩展的数据刷新层。用户输入新标的或固定 universe 扩大后，页面应优先读已有快照；缺失或过期时后台刷新并自动更新 UI，而不是让用户等待一整轮 collector。

当前已确认的实现事实：
- `schedule_option_refresh.py` 当前每 300 秒最多 enqueue 2 个 missing/stale symbols；78 个 symbol 一轮理论约 195 分钟。
- `run_refresh_worker.py` 使用 `FOR UPDATE SKIP LOCKED` claim jobs，数据库层已经支持多 worker 并发领取不同 job。
- 当前 worker 对 batch 内 jobs 仍是顺序 `for` loop；provider session/cache 只在单次进程内复用。
- ~~当前每个 option job 成功后会触发 per-symbol GEX，同时还重复执行全局 `materialize_oi_delta.run()` 和 `materialize_scan.run()`；多个 symbol 连续刷新时会重复做全局派生。~~ 已由 E3 修复：per-symbol GEX 仍即时计算，全局 OI delta 与 scanner 物化每个 worker batch 只执行一次。
- Polygon option provider 当前每个 symbol 先请求 underlying prev aggregate，再分页请求 option snapshot；stock request 使用本地 file-lock pacer，不能跨 Railway replicas 共享。
- Analyze orchestration 当前主要检查数据是否存在，freshness gate 不完整；有 stale snapshot 时可以显示旧数据，但用户提示和自动 refresh/polling 还不够统一。

目标架构：
```
Railway API
  -> 只读 PostgreSQL snapshots
  -> missing/stale 时 enqueue provider_fetch_jobs
  -> 不同步调用 provider

Mac Studio / Railway Collector Workers
  -> 多 worker 通过 PostgreSQL SKIP LOCKED 并发 claim jobs
  -> provider-aware concurrency limit
  -> bounded rate limiter shared by database state

Derivation Worker
  -> per-symbol GEX after option snapshot
  -> OI delta / scanner materialization batched once per worker cycle

PostgreSQL
  -> snapshots
  -> provider_fetch_jobs
  -> provider pacing state
  -> symbol_data_state freshness summary
```

任务拆分：
- ✅ **P2.8.1 统一 freshness 口径**（E5，2026-07-17 完成）
  - `server/src/domain/status/freshness.js` 是全部数据产品**唯一**的 freshness 契约。此前 freshness 散落在四个 route 各写各的：`prices.js`（5 天）、`metrics.js`（2 天）、`options.js`（180 分钟）、`market.js`（30M 自有规则）。
  - Freshness 现算不落库，与 E4 的表互补：E4 记录事实，本模块给判定。
  - 各产品口径：
    - price daily：按 market date 判断而非时钟——周末/假日本就没有 bar 可产生，上一交易日收盘仍然当前；多天容差正是用来吸收非交易日的。
    - price 30M：按 regular-session 30M market date 与**最新日线** market date 比较；落后即 `stale`（沿用 P1.4 既有规则，不另立第二套定义）。无日线可比时退回日线容差，不臆造判定。
    - option chain / GEX：按时钟 age。GEX 无独立 freshness，继承其计算所依据的 option snapshot。
    - metrics / IV Rank：交易日级别；derived rank 未满 252 observations 时继续返回 provider/cold-start provenance（未改动）。
  - **阈值刻意保持与被替换的 route 常量完全一致**（daily 5 天、metrics 2 天、option chain 180 分钟），使"统一定义"这一步不静默移动任何端点的阈值。P2.8 的 60 分钟目标会成倍放大 stale 驱动的入队量，因此留在 E6/E7（queue-fill scheduler + shared rate limiter）落地后再收紧；`OPTIONS_STALE_MINUTES` 可提前覆盖。
  - Analyze 不再只检查 existence：`GET /api/analyze/:symbol` 新增 `products`，逐 product 返回 `state`（`fresh|stale|missing|queued|failed`）、`freshness`、`is_stale`、`age_minutes`、`age_days`、`refresh_status`。既有 `coverage` 布尔与 `status` 保持不变，前端零改动即兼容。
  - `option_quotes` 是独立 product：链已落库但无任何可用 bid/ask 是常态，按链的 freshness 报 quotes 会谎报"策略腿可用"。
  - 真实数据 outranks refresh 状态：stale + failed refresh 报 `stale`（用户仍看得到真实数据），`queued`/`failed` 只描述"没有可展示的数据"。
  - Tests：`server/test/freshness.test.js` 13 个（缺失即 missing、未知 product 抛错、周末不算 stale、30M 落后日线即 stale、时钟 age、负 age 归零、不可解析时间戳不算 fresh、真实数据优先级）+ `analyzeRoute.test.js` 新增 5 个（stale 不塌缩为 ready、queued、blocked→failed 且不压制有数据的 product、quotes 独立、products 不泄露 provider 名）。
  - 验证：server 114/114（96 → 114）、collector 151/151。
  - 真实 runtime 证据（2026-07-17，本地 API 直连 Railway PostgreSQL）：`GET /api/analyze/AAPL` 全 product `fresh`，option chain age 19 分钟；`GET /api/analyze/NFLX` 返回 price/metrics `fresh`、option_chain `stale`（age 764 分钟，`refresh_status=queued`，仍如实报 age 而非空白）、`gex` `missing`、`option_quotes` `queued`——五个 product 五个独立判定。单元测试用 mock pool，因此该 SQL 由真实端点驱动验证，未只靠 mock。
  - Rollback：回滚本 commit；无 schema migration，`products` 为新增字段，移除不影响既有 `coverage` 消费方。

- ✅ **P2.8.2 symbol data state 汇总表**（E4，2026-07-17 完成）
  - 新增 additive table：`symbol_data_state(symbol, product, latest_snapshot_ts, latest_market_date, source, refresh_status, last_job_id, last_error_code, updated_at)`，PK `(symbol, product)`。
  - **与原计划的一处刻意偏离**：不落 `freshness` 列。freshness 随 wall-clock 衰减，一旦没有写入就立刻变成错的（60 分钟目标的行在第 61 分钟仍写着 `fresh`）。表只记录观测事实；freshness 由读方用 `latest_snapshot_ts` + product policy 在读取时计算。E5 定义该 policy。
  - Products 独立跟踪：`price_daily` / `price_30m` / `metrics` / `option_chain` / `gex`。一个 symbol 可以价格 fresh 而期权链 missing，绝不塌缩成单一 per-symbol 状态。
  - `collector/symbol_data_state.py` 是纯写入层（`record_success` / `record_failure` / `record_products`）；job 语义映射留在 worker 的 `job_product_facts()`。
  - 失败不擦除数据：upsert 用 `COALESCE` 保留上一次真实 snapshot，失败的刷新只更新 `refresh_status`/`last_error_code`，仍可作为 stale 展示。
  - `last_error_code` 只存粗粒度码（`auth_unavailable` / `no_quotes` / `insufficient_data` / `provider_unavailable` / `rate_limited` / `unsupported_provider` / `error`）。provider 名与请求明细不进入该表，仍留在 `provider_fetch_jobs.last_error` 给运维。
  - 写入为 best-effort：该表是读侧汇总，snapshot 表仍是 source of truth；记录状态失败不会把成功的刷新变成失败的 job。
  - Tests：`collector/tests/test_symbol_data_state.py` 14 个 —— symbol 规范化、未知 product/空 symbol 拒绝、错误码分类（含生产实测的 GEX 质量门）、失败不覆盖既有 snapshot、per-product 事实隔离、失败 job 标记全部所属 product、`__SCAN__` 不写 symbol 状态、状态写入失败不影响 job。
  - 验证：collector 151/151（138 → 151）、server 96/96。三个既有测试的 fake 补齐了真实行必有的字段（`SELECT *` 的 `snapshot_ts`/`source`、`PriceBar.date`），生产代码不为恒存在的字段做防御性降级。
  - Railway 迁移与 runtime 证据（2026-07-17）：additive migration 成功；表结构 9 列、PK + 2 索引、初始 0 行。PM2 daemon 直接运行本 repo，因此新 worker 代码在下一次 60 秒轮询即生效并写入真实状态：`IREN` job 1123 的 `option_chain` 与 `gex` 均 `ok`/`tt_internal`；`GDXJ` job 1122 的 `option_chain` 为 `ok`，而 `gex` 独立记为 `failed`（`underlying_price missing; cannot compute GEX`）—— 正是"链已落库但 GEX 未生成"必须分开记录的实证。该行的 `last_error_code` 由分类修复前的代码写成 `error`，下次 GDXJ 刷新即自动更正为 `insufficient_data`。
  - Rollback：表为 additive；无 API contract 变更，旧读路径继续直接读 snapshots。`DROP TABLE symbol_data_state` 即可完全回退。

- ✅ **P2.8.3 queue-fill scheduler**（E6，2026-07-17 完成）
  - 由"每轮只挑 2 个"改为"按目标队列深度补满"：`OPTION_REFRESH_QUEUE_TARGET=20`、`OPTION_REFRESH_MAX_ENQUEUE_PER_CYCLE=20`、`OPTION_REFRESH_SYMBOL_COOLDOWN_MINUTES=30`。
  - 队列**深度**才是约束 provider 负载的量；per-cycle cap 只限制被抽干的队列回填速度。原先 2 个/300s 而 worker 2 个/60s，worker 约 80% 时间空转。
  - `load_queue_depth()` 统计所有 outstanding option-chain job，**包含 on-demand**：它们消耗同一 provider 预算，用户请求高峰必须压制后台补数据，而不是叠加其上。
  - 优先级阶梯写入 `request_params.priority`，worker 按其 claim：`user_requested=100`（API 侧）> `core=80` > `recent_active=60` > `universe_scan=40` > `cold_backfill=20`。**全部后台 tier 严格低于 100**，有测试保证——否则后台扫描会让正在等页面的用户排到冷补齐后面。
  - Tier 表示"谁需要这份数据"，不表示"数据多旧"。staleness 只在 tier 内排序（missing 优先、最旧优先），不跨 tier 提升。
  - 候选来源改为 `symbol_universe`（active）：`watchlist.txt` 只是 seed，universe 会因用户分析未知 symbol 而增长，继续读文件会把 on-demand symbol 永久排除在后台刷新之外。表缺失/为空时回退 watchlist。
  - 移除已失效的 `OPTION_REFRESH_BATCH_SIZE`（PM2 config 与 `.env.example` 同步更新）——保留会变成静默无效的配置陷阱。
  - Tests：`tests/test_option_refresh_scheduler.py` 16 个（原 4 个全部保留且未修改断言）。新增：fill 到 target、队列满不入队、超额不返回负容量、per-cycle cap、tier 分配、recent_active 优先于 universe、**后台 tier 永不超过 on-demand**、高 tier 胜过更旧数据、tier 内 missing 优先、无 tier 时保持原排序、入队携带 tier priority、无 tier 默认 universe_scan。
  - 验证：collector 163/163（151 → 163）。
  - 真实 runtime 证据（2026-07-17，`pm2 reload ecosystem.config.cjs --update-env` 后）：universe 读到 **80** 个 symbol（watchlist 仅 67，证明 on-demand symbol 确实会被文件路径漏掉）；tier 分布 core 5 / recent_active 4 / universe_scan 71；`recent_active` 正确识别出刚被 Analyze 驱动的 NFLX/RKLB/MUU/TSLL。queue_depth 0 → capacity 20，本轮实际入队 **20 个**（core 3、recent_active 3、universe_scan 14），且 core tier 的 job 已在 `running` 而 universe_scan 仍 `queued`——证明 worker 的 `ORDER BY priority DESC` 与 tier 阶梯实际生效。
  - 未改动 `REFRESH_WORKER_BATCH_SIZE`：填满队列本身不提高 provider 并发，执行速率仍由 worker batch/poll 决定，提高它属于 E8 且必须在 E7 shared limiter 之后。
  - Rollback：`OPTION_REFRESH_QUEUE_TARGET=2` 即恢复旧吞吐；无 schema migration。
  - **E6 后续修复（2026-07-17，生产观测触发）**：reload 后日志出现 `provider budget exhausted: budget=1000`。E6 把吞吐从 2/cycle 提到填满 20,当天很快耗尽 `provider_request_usage` 里 polygon_licensed option_chain_snapshot 的自设日预算 1000,之后 scheduler 仍按队列深度填 20,worker 领取后立即在预算上失败——纯 churn,把 job 行刷成 failed。修复:`fill_count` 增加第三个上限 `remaining_budget`,`load_remaining_budget` 读同一张 `provider_request_usage`,预算耗尽时 capacity=0、scheduler 记 `budget exhausted` 并 idle,不再入队必然失败的 job。Tests +7(budget cap、耗尽入队 0、无 cap 同旧行为、大预算不抬高至超过队列需求、None/gap/非负）。真实验证:当天 remaining=0 → capacity=0（此前会填 20）。
  - **预算已提高（2026-07-17 已决策并落地，见本文件顶部事件记录 + commit `ae58097`/`48b1cbc`）**：`PROVIDER_DAILY_BUDGET` 从 1000 提到 **50000**（`ecosystem.config.cjs` + `.env.example`）。Polygon 付费档 API 调用无限,故此值是 runaway backstop 非成本节流,1000 会在收盘前就饿死当天刷新。同批还做了两处:①`provider budget exhausted:` 设为不可重试（预算当天不回补,重试只是撞墙）；②Railway 刷新 cron 已按 Option B 停用（`railway.metrics.json` 去掉 `cronSchedule`）,Mac Studio 成唯一写者,消除两地争抢同一预算行。已知遗留:scheduler 预算 gate **fail-open**（`load_remaining_budget` 读不到 usage 行返回 None=无限额）,靠把预算设得远高于实际需求来避免触发,未在代码里改成 fail-closed。

- [ ] **P2.8.4 bounded parallel refresh workers**
  - **开工前必读（2026-07-17 由 E7 实施时发现的设计冲突，尚未解决）**：E3 让全局派生每个 worker batch 只跑一次，但那是**进程内**的 `PendingDerivations`。直接起 2 个 worker 会让每轮出现 2 次全局 `materialize_scan` / `materialize_oi_delta`，把 E3 的收益按 worker 数打回去。同理，`recover_stale_running_jobs`、`deduplicate_queued_jobs`、`fail_unrunnable_queued_jobs` 目前假设单进程，多 worker 并发执行时行为未经验证。
    - 结论：并行 worker 必须先把全局派生从 worker 循环中拆出去（独立 derivation job 或单例 materializer），否则不是提速而是重复劳动。这一点应在起第二个 worker **之前**解决。
    - 已就绪的部分：`fetch_jobs` 已用 `FOR UPDATE SKIP LOCKED` + priority ordering，数据库层本身支持多 worker 领取互不相交的 job；E7 的共享限流已就位，因此并发不会直接放大 429。
  - 利用现有 `FOR UPDATE SKIP LOCKED`，先在 Mac Studio 启 2 个 worker processes 验证，不在线程内共享 psycopg/provider session。
  - 每个 worker 独立 DB connection；连接池上限必须小于 Railway PostgreSQL 可承受连接数。
  - 初始并发建议：2；验证 429、job duration、DB CPU/connection 后升到 4。
  - 并发边界：
    - API service 不跑 collector。
    - Railway 可以单独创建 `polygon-collector` service；Mac Studio 继续跑 IB/TT/internal collector。
    - TT/IB 不跟 Polygon 共用 worker 池；provider adapter 独立限流。

- ✅ **P2.8.5 shared provider rate limiter**（E7，2026-07-17 完成）
  - 新增 additive table `provider_rate_limits(provider, scope, next_allowed_at, last_status, updated_at)`，PK `(provider, scope)`。
  - 新增 `collector/providers/provider_rate_limit.py::DatabaseRequestPacer`。`PolygonStockRequestPacer` 改为 facade：有 `DATABASE_URL` 走共享后端，无 DB 时降级为原 file lock 并明确 warn，不静默发出不受限请求。
  - **原子 slot 认领**：一条语句 `INSERT ... ON CONFLICT DO UPDATE SET next_allowed_at = GREATEST(next_allowed_at, NOW()) + delay RETURNING (next_allowed_at - delay - NOW())`。调用方认领"下一个空位"并被告知还要等多久；两个 worker 竞争会拿到两个**不同**的 slot，不可能撞在同一时刻。
  - **数据库时钟是唯一权威**：等待时长在 SQL 内计算，因此系统时钟有偏差的两台 worker 不会都认为轮到自己。这是 file lock 无法提供的性质。
  - **不持锁睡眠**：认领立即 commit 并关闭连接，调用方在事务外等待；一次限流请求不会把连接占住整个 delay。
  - **429 惩罚是共享的**：原实现在 429 后 `time.sleep()` 只暂停当前进程，其余 worker 继续猛打——这正是单次拒绝演变成请求风暴的机制。现改为 `penalize()` 推移共享 slot，所有 worker 一起退避；`GREATEST` 保证并发 429 中较短的 `Retry-After` 不会缩短已生效的较长退避。
  - 等待有上限（`PROVIDER_RATE_LIMIT_MAX_WAIT=300`），配置错误或异常惩罚不会静默地把 worker 永久停住。
  - Tests：`tests/test_provider_rate_limit.py` 9 个（并发 worker 拿到不同且按 delay 间隔的 slot、多 worker 间隔累进、scope 互不阻塞、delay=0 不碰 DB、共享惩罚影响其他 worker、短惩罚不缩短长惩罚、等待封顶、连接释放且不在睡眠时持有、失败回滚并上抛）+ `tests/test_polygon_rate_limit.py` 扩到 4 个（原 2 个 file-lock 测试保留断言不变，新增"有 DB 时默认不选 file 后端"与"共享限流失败降级为本地锁"）。
  - **修复了一个测试隐患**：改动后原 file-lock 测试会因 `.env` 里存在 `DATABASE_URL` 而真的去连生产数据库。`test_polygon_price_provider` 与 `test_polygon_reference_metadata` 的 429 用例同样受影响——它们一度"通过"只是因为 DB 调用恰好失败并降级为本地 sleep，即测试结果取决于生产数据库是否可达。现三处均显式钉住 `PROVIDER_RATE_LIMIT_BACKEND=file`，且 429 断言改为验证真实契约（调用共享 `penalize`，而非本地 sleep）。
  - 验证：collector 174/174（163 → 174）。套件耗时由 0.367s 降至 0.037s，且以无效 `DATABASE_URL` 连跑三次均 174/174——证明单元测试确实不再触达数据库。
  - 真实 runtime 证据（2026-07-17，真 SQL + Railway 数据库时钟，探针行已清理）：worker A 等待 `0.0s`；worker B 等待 `15.8s`（独立 slot，按 16s delay 间隔）；另一 scope 等待 `0.0s`（预算独立）；`penalize(120)` 后**另一个** worker 等待 `119.8s`（证明退避是共享的，不是本进程 sleep）；随后 `penalize(5)` 未缩短既有退避。
  - Rollback：`PROVIDER_RATE_LIMIT_BACKEND=file` 立即回到旧行为；表为 additive。

- ✅ **P2.8.6 ingestion 与 derivation 解耦**（E3，2026-07-17 完成）
  - option snapshot 写入后只立即计算该 symbol 的 GEX；GEX 失败仍按原逻辑降级为 `gex_status=skipped`，不阻断 snapshot。
  - `materialize_oi_delta` 和 `materialize_scan` 由“每个 option job 执行一次”改为“每个 worker batch 执行一次”。`PendingDerivations` 只记录本 batch 哪些全局派生被 invalidate；`run_pending_derivations` 在 batch 末尾各执行一次。
  - `scanner_materialize` job 不再 inline 执行：job row 保持 `running`，直到 batch 末尾的真实结果回写 `succeeded`/`failed`。失败的物化绝不会被记成成功。
  - OI delta 失败不阻断 scanner 物化：两者独立 try/except，各自如实记录 `materialized` / `failed` / `skipped`。
  - 无 batch accumulator 的调用方（测试、ad-hoc 调用）保持 inline 行为，签名向后兼容。
  - Tests：`collector/tests/test_batch_derivation.py` 8 个 —— 10 个 option job 只跑一次全局派生、gex_recompute 延迟物化、空 batch 不跑派生、deferred job 仅在真实成功后 succeeded、失败物化使来源 job failed、OI delta 失败不阻断 scanner、scanner_materialize 不 inline、无 pending 时仍 inline。
  - 验证：collector 138/138 通过（130 → 138）。
  - Rollback：回滚本 commit；无 schema migration，无 API contract 变更。

- ✅ **P2.8.7 减少每 symbol 冗余请求**（E9，2026-07-17 完成）
  - `PolygonOptionChainProvider.fetch_option_chain/fetch_underlying` 新增 `spot_hint`：给定时用它构造 underlying（`endpoint=db_spot_hint`）并跳过整个 `/prev` 请求；未给定时行为不变,照打 `/prev`。
  - worker 新增 `latest_db_spot(conn, symbol)`：取 `price_history` 最新 `polygon_licensed` daily close,且 market date 在 `OPTION_SPOT_HINT_MAX_AGE_DAYS`(默认 4,覆盖周末/假日)内;缺失或过旧返回 None → 回退 `/prev`,不会用陈旧价格居中期权链。
  - 只对 `polygon_licensed` 传 hint:tt/ib 的 spot 本就在各自 chain payload 里,不查 DB、不加 kwarg。
  - 一个 fresh daily close 与 `/prev` 的前日收盘对"±15% 居中 strike window"是等价质量,因此省掉的是纯冗余请求,不牺牲正确性。
  - Tests：provider 2 个（有 hint 不打 `/prev`、无 hint 照打）+ worker 4 个（fresh 返回、missing/stale 返回 None、polygon 传 hint、tt 不查 DB 不传 kwarg）。base Protocol 签名同步加 `spot_hint`。
  - 验证：collector 180/180（163 → 180，本批含 E9 6 个）。真实 runtime（2026-07-17，直连 Railway）：`latest_db_spot` 返回 AAPL 333.26 / SPY 750.72 / NFLX 73.68,不存在的 symbol 返回 None。
  - 效果：78-symbol 一轮 option refresh 少打最多 78 条 stock prev aggregate,直接减轻 E7 共享限流器上的 Polygon Stocks 预算压力。
  - Rollback：回滚本 commit,或设 `OPTION_SPOT_HINT_MAX_AGE_DAYS=0` 使 hint 几乎总为 None（等于恢复每次 `/prev`）；无 schema 变更。

- [ ] **P2.8.8 stale-while-refresh 前端体验**
  - Analyze：
    - fresh：正常显示。
    - stale：显示旧快照并提示“正在刷新，通常 1-3 分钟”，每 5 秒轮询 data-state；刷新完成后自动重新分析。
    - missing：显示“正在准备首次数据”，不显示 mock 或空策略。
    - failed：显示可理解错误，不暴露 `price / metrics / metrics_source / options / gex` 内部字段名。
  - Weekly：
    - 自定义 symbol 若缺数据，注册并 enqueue；已有 stale 周复盘数据时显示旧版并标记刷新中。
  - Scan：
    - scanner batch stale 时仍显示上一批真实候选，并标记 batch age；后台 materialize 完成后刷新列表。

- [ ] **P2.8.9 Railway 承载验证**
  - PostgreSQL 承载估算：78 symbols × 120 contracts ≈ 9,360 contract rows/轮，批量 upsert 对 Railway PostgreSQL 可接受；真正瓶颈是 provider pacing 和重复派生。
  - 验证顺序：
    - Mac Studio 2 worker dry-run：记录 p50/p95 job duration、success/failure、429、DB connection count。
    - shared limiter 开启后 2 worker live run。
    - Railway 单独 `polygon-collector` service 2 worker。
    - 观察后升 4 worker。
  - 验收指标：
    - 78-symbol option refresh full pass 从约 195 分钟降到目标 < 60 分钟。
    - user-requested symbol 首次可用目标 1-3 分钟。
    - `provider_fetch_jobs` 无 stale `running` 堆积。
    - 429 被 backoff，不触发连续失败风暴。
    - scanner materialization 不重复执行 N 次。

测试要求：
- Collector unit tests：scheduler priority、queue target、cooldown、SKIP LOCKED 多 worker、shared limiter、batch derivation once。
- Server tests：fresh/stale/missing/queued 状态 contract；Analyze 不因 stale existence 误判 ready；Weekly custom symbol enqueue。
- Frontend tests：stale old-data display、queued polling refresh、missing no-mock、scanner stale batch labeling。
- Runtime evidence：记录 command、commit、DB URL environment（不打印 secret）、worker count、symbol count、contracts written、job duration、429 count、scanner rows、GEX rows。

Deployment readiness：
- 不把 collector 放进 API service；Railway 需要独立 `polygon-collector` service。
- Mac Studio IB/TT collector 保留为 internal/fallback/ad hoc 路径。
- 多 worker 上线前必须先合并 shared provider limiter；否则本地 file lock 在 Railway 多实例下无效。
- 回滚方法：将 worker count 降回 1、queue target 降回 2、关闭 Railway collector service；additive `symbol_data_state` / pacing 表可保留。

**P0 — 最高优先级：全量切换至 Polygon（使用环境变量中的订阅 key）**

目标：消除对 IB Gateway 的价格依赖，并逐步替换 Tastytrade 的 IV/HV 字段。

| 子任务 | 当前来源 | Polygon 替代 | 时机 |
|---|---|---|---|
| 日线 OHLCV（price_history） | IB internal | `/v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}` | 立即可做 |
| 30M OHLCV（price_history_30m） | 无 | `/v2/aggs/ticker/{symbol}/range/30/minute/{from}/{to}` | 顺带采集 |
| HV30/60/90 | Tastytrade | 从 price_history 自算（log return stddev × √252） | 积累 90 天日线后 |
| IV Rank / iv_percentile | Tastytrade | 从 option_contract_snapshots ATM IV 自算 | 积累 252 天快照后 |
| 财报日 earnings_date | Tastytrade | 无 Polygon 替代，保留 Tastytrade 仅取此字段 | 长期保留 |

**P0.1 — Price history 切换（立即执行）**
- ✅ `collector/providers/polygon_price_provider.py`：新增 Polygon price adapter
  - `GET /v2/aggs/ticker/{symbol}/range/1/day/{from}/{to}?adjusted=true&sort=asc&apiKey=...`
  - 同时采集 30M 数据：`/v2/aggs/ticker/{symbol}/range/30/minute/{from}/{to}`（写入 `price_history_30m` 或加 `interval` 字段）
  - BRK.B 等特殊 ticker 保持现有 normalization 规则
- ✅ `collector/collect_prices.py`：加入 `PRICE_PROVIDER=polygon` 分支
- ✅ `collector/ecosystem.config.cjs`：`quantrift-options-prices` 改用 `PRICE_PROVIDER=polygon`
- ✅ 验证：67 symbols 全部写入，date range 正确，source=`polygon_licensed`
- ✅ 停用 IB internal price 依赖（保留 `ib_price_provider.py` 文件但不再调度）

完成证据（2026-07-15）：
- Adapter：日线最多 400 bars；30M 近 35 calendar days；`BRK.B` canonical identity 保持不变；Polygon 任何 timeframe 空结果时该 symbol fail-closed
- Schema/API：Railway 已创建 `price_history_30m`；`GET /api/prices/:symbol?interval=day|30m` 保持日线默认兼容并可读取 intraday VWAP/trade count
- Rate limit：`PolygonStockRequestPacer` 用 file lock 在 option `/prev` 与 price aggregates 两个 PM2 进程间共享 16 秒间隔；429 尊重 `Retry-After`/长 backoff
- Tests：collector 61 tests passed；server 10 tests passed；覆盖 parsing、UTC/ET 时间、normalization、429、跨进程 state、persistence、daily-only fallback、PM2 config、API intervals
- Railway：daily 67/67、26815 rows、每 symbol 349-401 rows、range 2024-12-05 → 2026-07-15；30M 67/67、39135 rows、每 symbol 319-736 rows、range 2026-06-10 08:00Z → 2026-07-14 23:30Z；两个表 duplicate key=0
- Source：所有 67 symbols 均有 Polygon rows；日线保留每 symbol 1 条更晚的旧 `ib_internal` row（共 67），不删除更近数据，row-level source 如实保留
- PM2：option collector 已恢复 online；price one-shot 为 stopped + cron active（工作日 13:35 PT），`provider=polygon`、`symbols=watchlist`、`delay=16`、secret configured；`pm2 save` 完成

**✅ P0.2 — HV 自算（2026-07-15 完成）**
- ✅ `collector/derive_volatility.py`：只从 `source=polygon_licensed` 的 `price_history` 计算 HV30/60/90
  - `HV30 = stddev(log(close[t]/close[t-1]), window=30) × √252`
  - 写入独立 `volatility_history`，不覆盖 provider 原始 `iv_history`
  - `hv_source=polygon_derived`
- ✅ 完成 Tastytrade 对比报告；67-symbol 最新值 median absolute difference：HV30 14.97pp、HV60 8.39pp、HV90 6.40pp。差异远大于 1%，证明 TT 口径不是本公式的 parity oracle；验证标准改为公式、输入来源、观测数和重放确定性
- ✅ `/api/metrics` 与 scanner 已停止消费 Tastytrade HV：优先使用 Polygon derived HV；`USE_DERIVED_VOLATILITY=false` 可回滚。TT 原始行暂保留作审计/对比，不混写派生表

**✅ P0.3 — ATM IV / IV Rank readiness（2026-07-15 完成）**
- ✅ `collector/derive_volatility.py` 从 Polygon `option_contract_snapshots` 提取 ATM IV 时序
  - ATM IV = 最接近 spot 的 call IV（当前 expiry 30-45 DTE）
  - IV Rank = (ATM IV - 52周最低) / (52周最高 - 52周最低) × 100
  - 写入 `volatility_history`，`iv_source=polygon_derived`
- ✅ Polygon option collector 按 DTE buckets 保留 expiry，并在初始分页缺少 30–45 DTE 时执行一次 bounded supplement；不会让近月合约耗尽总 cap
- ✅ ATM 交易日使用 `America/New_York`，避免 UTC 午夜把 30 DTE 错算成 29 DTE
- ✅ API/scanner 按字段返回 `iv_source`、`hv_source`、`iv_rank_source`、`iv_rank_ready`、`iv_observation_count`
- [ ] 满 252 个独立交易日后自动使用 derived IV Rank 并停止 Tastytrade iv_rank；当前 1–2 observations/symbol、0/67 ready，继续使用 TT 冷启动值，不提前伪造 readiness
  - ✅ 自动切换代码已完成：`collect.py` 在认证前过滤 ready symbols；refresh worker 对 ready symbol 返回 `already_ready`；Analyze 不再 enqueue TT metrics job
  - ✅ Tests：server 40/40、collector 81/81；synthetic 252 observations 已验证 rank readiness，worker/collector/API 已验证 provider cutoff
  - [ ] Runtime 时间门槛：当前 Railway 0/67 ready；此项只能随独立市场日快照积累，不能用重复/合成日期提前完成

完成证据（2026-07-15）：
- Railway `volatility_history` 已迁移；初次历史回填写入 24,738 HV rows
- targeted 17-symbol option backfill：17 snapshots written、0 failed、每 snapshot 32–84 个真实 provider contracts
- 最新派生运行：67 HV rows、67 ATM rows；watchlist ATM coverage 67/67；ATM DTE 30–43
- 最新 scanner batch：67/67 `hv_source=polygon_derived`、67/67 `iv_source=polygon_derived`、67/67 `iv_rank_source=tastytrade`、0/67 `iv_rank_ready`
- 真实 API smoke：`/api/metrics?symbols=QQQ,STX,AAPL` 返回 hybrid 字段来源和 30–36 DTE ATM；`/api/scan?...limit=3` 返回最新 materialized rows
- Tests：collector 69 passed；server 12 passed；frontend build passed；Python compile / `git diff --check` passed
- Rollback：设置 `USE_DERIVED_VOLATILITY=false` 并重新 materialize scanner；`volatility_history` 为附加表，无需删除 provider 原始数据

---

**P1 — 数据已有，可立刻做**
1. ✅ Screener 策略扩展：13 种真实合约结构与风险门控已完成
2. ✅ S/R 端点：server 新增 `GET /api/sr/:symbol` + Tab2/Tab4 K线图叠加支撑压力水平线
3. ✅ Scan 页顶部 Market Regime Header（SPY/QQQ GEX regime + IV Rank；VIX 无同口径数据时不伪造）

**P2 — 需要小改后端**
4. ✅ 非 watchlist 标的按需 enqueue + 前端等待/blocker UI（`/api/analyze/:symbol` 对未知 symbol 触发完整数据 bundle）
5. ✅ Focus Score / 综合动量评分（`price_history` 派生：MA位置 + RSI + 量能参与度）
6. ✅ Vol Risk Premium（IV-HV diff）作为独立指标在 Analyze 页显示；Scanner 推理链条留在 P1.3 candidate ranking 文案中继续细化

**P3 — 需要新数据源**
7. [ ] Reddit Trends 真实采集验收
   - ✅ OAuth client-credentials provider、descriptive User-Agent、bounded pagination、401 单次刷新、429 `Retry-After`
   - ✅ 只匹配 persistent universe；ambiguous ticker 需 `$`；按帖子去重并生成 24h mention/engagement score
   - ✅ `community_trend_snapshots` / `community_symbol_trends` Railway migration
   - ✅ Scanner API 独立 join 最新社区 snapshot；社区数据不进入期权机会分
   - ✅ Scan 页可排序“社区热度”列；missing/stale/fresh 明确显示
   - ✅ PM2 30 分钟 job 已注册并保存，默认 `REDDIT_TRENDS_ENABLED=false`，日志验证 disabled-safe
   - ✅ Schema-contract regression：universe SQL 使用真实列 `scan_enabled`；测试防止重新引入不存在的 `scannable`；collector 96/96
   - ✅ Tests/build：collector 90/90、server 58/58、frontend 23/23、full ESLint、Vite build
   - [ ] 提供 `REDDIT_CLIENT_ID`、`REDDIT_CLIENT_SECRET`、`REDDIT_USER_AGENT`，获得 Reddit Data API access 后完成真实 snapshot/UI 验收
8. ✅ 30min Breakout 信号：Polygon 30M OHLCV + previous-range/volume confirmation + freshness gate

---

### 前端接入剩余优先级

| 优先级 | 页面/组件 | 当前状态 | 目标 |
|---|---|---|---|
| Done | Tab4 OI 密度图 | 已接入 | 独立选择最新 OI snapshot，按所有未到期 expiry 聚合 Call/Put OI by strike；不再用 GEX 代替 |
| Done | Tab3 IV Skew / Term Structure | 已接入 | `/api/chain/stats/:symbol` 从真实 IV contracts 派生 |
| Done | Tab1 Gamma Flip 指标 | 已接入 | `gex_snapshots.gamma_flip` |
| Done | Tab1 Local Gamma | 已接入 | `gex_snapshots.local_gamma` |
| Done | Weekly Sec2 真实 Gamma 迁徙 | `/api/weekly/:symbol` | 每个美东 market date 取最新 GEX + by-strike；仅显示已有日期 |
| Done | Weekly Sec3 真实 Max Pain | `/api/weekly/:symbol` | `gex_snapshots.max_pain` 已接入；缺失时局部 unavailable |

---

### ✅ Scanner 策略扩展（P1.1，2026-07-15 完成）

- ✅ 当前已支持：Iron Condor, Bull Put Spread, Bear Call Spread, Long Straddle（+ Bull Call Spread / Short Strangle fallback label）
- ✅ 已加入后端枚举（`server/src/domain/scanner/candidateEngine.cjs`）：
  - **Short Strangle**：无 Delta 约束时选 far OTM call + far OTM put（同 expiry）；high IV 环境
  - **Iron Butterfly**：body 在 ATM，wings 对称；low move 预期 + 高 IV
  - **Diagonal Spread**：不同 expiry；long far-date leg + short near-date leg；需跨 expiry 报价
  - **Long Call / Long Put**：低 IV 买方；low IV Rank + 强方向性 + 催化剂
  - **Calendar Spread**：跨 expiry 卖近买远；IV term structure skewed
  - **Jade Lizard**：Short Put + Short Call Spread；无上方风险；需三腿同 expiry
  - 裸卖方（Short Put/Short Call）：需风险资质门控；默认流程不推荐，高级模式开放

实现与验证证据：
- `ACTIONABLE_STRATEGIES` 共 13 种：原 4 种 + Short Strangle / Iron Butterfly / Calendar / Diagonal / Long Call / Long Put / Jade Lizard / Short Put / Short Call
- Short Strangle、Short Put、Short Call 默认不枚举；UI 必须显式开启“高级裸卖风险策略”
- Calendar/Diagonal 强制 near expiry short + farther expiry long；Iron Butterfly 强制同 expiry/同 ATM body/对称真实 wings；Jade Lizard 仅当总 credit 覆盖 call width 才输出
- pricing 使用 sell bid / buy ask；缺 quote、负 credit、错 expiry、缺腿或风险计算失败时不输出
- `/api/scan` 将 latest positioning snapshot 与 latest usable quote snapshot 分离，避免无 bid/ask 的新 Polygon snapshot 遮住已有 IB/TT quotes；返回 `quote_source/quote_snapshot_ts/quote_freshness`
- scanner DTE 使用 `America/New_York` market date，不使用 UTC `CURRENT_DATE`
- Railway runtime：最新任意 snapshot quoted coverage 0；latest usable quote coverage 55 symbols（IB 54 + TT 1）；修复后前 20 scanner rows 中 18 有 quotes，默认策略枚举 667 candidates，覆盖 10 种非裸卖结构
- Tests：frontend 17 passed、server 13 passed；changed frontend files lint 0；frontend build passed
- Historical verification gap：当时仓库全量 lint 有 21 个既有 errors；P2.4 已在独立 commit 清零。Browser plugin 初始化报 `Cannot redefine property: process`，因此本 section 未取得自动 screenshot，未宣称 visual browser tested
- Rollback：回滚本 section commit；无 schema 迁移
- ✅ **Vol Risk Premium UI 补全**：
  - 后端 `iv_hv_diff`（IV30 - HV30）已采集，`signal_score` 已用，但前端未显示
  - Analyze Tab1 增加独立的 "Vol Risk Premium" 指标卡（IV-HV diff = 卖方溢价来源）
  - Scanner 推荐理由栏展示推理链条（"IV Rank 72 + IV > HV → 卖方溢价存在 → 推荐 Iron Condor"）

---

### 非 watchlist 标的按需查询架构

- 现有 `provider_fetch_jobs` 队列已支持按需 enqueue
- 当前 `/api/gex/:symbol` 对未采集标的返回 `freshness=missing`
- ✅ API 对未知标的注册 persistent universe，并 enqueue metrics/price/options/GEX/scanner bundle；返回 product-level ready/queued/blocked
- ✅ 前端显示数据采集状态、已有 partial products 与 non-retryable blocker；PostgreSQL snapshot 是缓存层。按需 refresh worker 每 60 秒取队列，产品提示采用通常 `~1-3min`，不向用户暴露 `price / metrics / options / gex` 内部字段名；queued 状态每 5 秒检查一次，任一数据产品写入后自动重新分析。
- 无需为此修改数据库 schema

---

### 新增 API 端点规划

```
GET /api/chain/stats/:symbol   ← 已建：IV Skew + Term Structure（真实 IV by strike+expiry）
GET /api/sr/:symbol            ← 已建：pivot-based S/R zones + Focus Score（从 price_history 计算）
```

**`/api/chain/stats/:symbol` 逻辑**
- 从 `option_contract_snapshots` 最新 snapshot 读取：`expiration, strike, option_right, iv`
- IV Skew：同一 expiration，各 strike 的 IV 曲线（put skew 斜率 = 市场恐慌程度）
- Term Structure：各 expiration 的 ATM IV（前端画连线图）

**`/api/sr/:symbol` 逻辑**
- 从 `price_history` 取最多最近 250 天 OHLCV
- Pivot High = high[i] > high[i-1] and high[i] > high[i+1]
- Pivot Low = low[i] < low[i-1] and low[i] < low[i+1]
- 聚合相近 pivots（±1%）成 S/R zone
- 可叠加 Call Wall / Put Wall 作为 options-derived level

### ✅ Analyze 数据产品（P1.2，2026-07-15 完成）

- ✅ `GET /api/sr/:symbol`：最多 250 根真实日线、2-bar pivot、±1% level clustering；返回最多 3 个 support / resistance 及触碰次数
- ✅ Focus Score：0–100，使用 MA20/50/200、RSI14、5日动量与 RVol；少于 20 bars fail closed；纽约当日未完成日线不计算 RVol
- ✅ `GET /api/chain/stats/:symbol`：选择最新含真实 IV 的 snapshot，返回最近 expiry 的 call/put IV skew 与各 expiry ATM IV term structure
- ✅ `/api/chain/stats/:symbol` 独立选择最新含 OI 的 snapshot；跨未到期 expiry 聚合 `call_oi` / `put_oi` / `total_oi` by strike，返回独立 source/freshness
- ✅ Analyze Tab1：独立展示 Focus Score、Vol Risk Premium、Gamma Flip、Local Gamma 与技术 S/R
- ✅ Analyze Tab2/Tab4：真实 price history 叠加 S/R；没有真实历史时显示 unavailable，不再生成示例走势
- ✅ Analyze Tab3：展示 IV Term Structure 与 IV Skew；保留 source/snapshot/freshness contract
- ✅ Analyze Tab4：主力持仓密度使用真实 OI by strike 堆叠显示 Put/Call；缺 OI 时 unavailable，不回退 GEX
- ✅ Analyze 不再从 spot/wall target 合成不存在的推荐合约腿；没有真实 candidate attachment 时 recommendation 保持空

完成证据：
- Server tests 21/21；frontend tests 19/19；affected frontend lint 0 errors；原 effect dependency warning 已由 P2.4 独立修复；Vite production build passed
- Railway PostgreSQL runtime：AAPL S/R 读取 250 bars、Focus Score ready；chain stats 读取 56 个真实 IV contracts、5 个 ATM term points
- Runtime 发现并修复 PostgreSQL `DATE` 被序列化为 `Wed Jul 15` 的问题；API 统一 `YYYY-MM-DD`，expiry 排序有 Date-object 回归测试
- Visual verification gap：Browser plugin 初始化仍报 `Cannot redefine property: process`，因此本 section 未取得自动 screenshot，未宣称 browser-tested
- Rollback：回滚本 section commit；无 schema migration

P1.2 OI-density follow-up verification（2026-07-15）：server 58/58、frontend 21/21、全量 ESLint 通过、Vite production build passed。Local API 直连 Railway PostgreSQL 的 PLTR smoke 返回 `polygon_licensed`、fresh、7 expiries、84 contracts、11 strike points、total OI 307,713；OI 与 IV snapshot 独立选择，无 schema migration。

---

### 30 分钟级别股价数据

- TradingView：无可编程 API，排除
- Interactive Brokers：支持 `barSize='30 mins'`，但有 pacing limits（10秒/请求约束）
- **Polygon（已实现）**：`/v2/aggs/ticker/{symbol}/range/30/minute/...` 写入 `price_history_30m`；shared pacer 控制当前 entitlement 请求速率
  - 用途：30M momentum 与 Breakout；只消费 New York regular-session bars

---

### Scan 页 Market Regime Header（已实现）

- 页面顶部显示当前大盘环境：SPY/QQQ 的 GEX regime + IV Rank + 日线/30M 趋势评分；VIX 未有完整同口径数据，未伪造加入
- 让用户在看 scanner 结果前先了解大盘情绪
- 数据来源：`gex_snapshots` + `iv_history` + `price_history` + `price_history_30m`；30M market date 落后时返回 stale

---

### 数据架构现状（2026-07-15）

```
当前生产数据流：

  Polygon.io API（已接入）
    └── 每日快照采集（期权链）
          ├── OI / volume / gamma / delta / IV by strike+expiration
          ├── 写入 option_chain_snapshots + option_contract_snapshots
          └── 触发计算：GEX / PCR / Call Wall / Put Wall / Max Pain / Gamma Flip / Local Gamma

  Tastytrade API（保留，仅取 iv_rank）
    └── iv_rank / iv_percentile（冷启动过渡期用）
    └── 财报日 expected-report-date

  Polygon Stocks aggregates
    ├── 日线 OHLCV → price_history
    ├── regular-session 30M OHLCV → price_history_30m
    └── HV30/60/90 → volatility_history

  Mac Studio PM2
    ├── quantrift-options-collector（daemon，每60秒处理 refresh jobs）
    └── quantrift-options-prices（cron，周一至五 13:35 PT）

  Railway
    ├── PostgreSQL（iv_history / option_chain_snapshots / gex_snapshots / price_history）
    └── Node.js API（另含 /api/market/regime / /api/weekly/:symbol）
```

---

### 成本汇总（2026-07-15）

| 服务 | 月费 | 用途 | 何时停 |
|---|---|---|---|
| Polygon.io Options Starter | $29 | 期权链核心数据（商用授权） | 长期保留 |
| Railway（PostgreSQL + Node.js） | ~$5 | 数据库 + API | 长期保留 |
| Tastytrade API | 免费 | IV Rank 过渡期 | 积累 252 天后停 |
| yfinance | 免费 | 价格历史 / HV / fallback | 长期保留 |
| **合计** | **~$34/月** | | |

---

## 🛡️ V3A — Product Protection Architecture（商业化前架构调整）

> 目的：把 Quantrift 的核心算法、候选生成、评分逻辑、数据权限和运营状态从浏览器可见层移到后端与数据库受控边界内。这个任务块对应 `docs/QUANTRIFT_IP_PROTECTION.md` 中的产品保护方案，不改变任何交易策略含义，不改变自动交易、下单或持仓逻辑。

### Immediate Priority（现在就应先做）

- ✅ **V3A immediate core**：已把 `frontend/src/lib/scanOpportunity.js` 的推荐算法迁到后端，并让 `/api/scan` 停止返回完整合约链。
  - 先做范围：`V3A-1 Backend Scanner Candidate Engine` + `V3A-3 Remove Raw Option Chain From Normal Scanner API`。
  - 暂缓范围：认证、限流、数据库角色、审计和更完整的商业化安全边界可在高度商业化前按 `V3A-5` 到 `V3A-8` 分阶段完成。
  - 完成标准：普通 scanner response 只返回最终 candidate DTO；前端不再包含候选枚举、评分权重和完整策略经济性算法；浏览器拿不到完整 raw option contract chain。
  - 交付：`server/src/domain/scanner/candidateEngine.cjs` 负责真实合约枚举、策略腿、经济性与排序；`frontend/src/lib/scanOpportunity.js` 已删除；`/api/scan` 只返回候选行的 `concrete_setup`，不返回 `option_contracts`。
  - 验证：2026-07-16 `server npm test` 82/82 通过；`frontend npm test` 36/36 通过；`frontend npm run build` 通过且 `frontend/dist` 无 `.map` 文件。

### 当前已确认的问题

- ✅ Scanner 候选生成仍在前端暴露：
  - Historical evidence：`frontend/src/pages/Scan.jsx` 曾调用 `frontend/src/lib/scanOpportunity.js`。
  - 已修复：算法已迁到 `server/src/domain/scanner/candidateEngine.cjs`，前端模块已删除。
  - 结果：策略枚举、评分权重和经济性筛选不再随前端 bundle 发送。
- ✅ `/api/scan` 仍向浏览器返回过多原始合约数据：
  - Historical evidence：`server/src/routes/scan.js` 曾聚合并返回 `option_contracts`。
  - 已修复：route 内部使用该数据生成候选后，在 response 前删除完整链。
  - 结果：普通 scanner 用户只收到具体候选单、legs、收益风险、解释和数据新鲜度。
- [ ] Analyze 页部分解释/推荐逻辑仍在前端：
  - 当前证据：`frontend/src/lib/analyzeData.js` 与页面组件承载部分 narrative / recommendation 拼接。
  - 当前问题：用户看到的是产品结论，但结论生成逻辑不应放在浏览器端。
- [ ] Auth/entitlement 仍处于 rollout gate：
  - 当前证据：`AUTH_ENFORCEMENT_ENABLED=false`。
  - 当前问题：商业化前可以保留 gate；商业化上线时付费 API 必须 fail closed。
- [ ] Internal status/operation endpoints 需要拆分：
  - 当前证据：`/api/status` 暴露 job summary、failures、scanner status、provider usage。
  - 当前问题：健康检查可以公开；collector/provider/job failure 细节应进入 admin/service-token API。
- [ ] Provider/source 文案暴露过细：
  - 当前问题：普通 UI 不需要显示 `polygon_licensed`、`ib_internal`、`tt_internal` 这类内部 provider/source 名。
  - 目标展示：数据日期、新鲜度、完整度、是否延迟/刷新中；内部 provider 保留给 admin/debug。
- [ ] API memory cache 是单实例缓存：
  - 当前证据：`server/src/lib/cache.js` 使用进程内 `Map`。
  - 当前问题：商业化后多实例部署、rate limit、stale-while-refresh、provider budget accounting 需要共享状态。
- ✅ Vite sourcemap 与前端 bundle 保护需要显式配置：
  - 当前证据：`frontend/vite.config.js` 未显式声明 production sourcemap policy。
  - 当前问题：商业化前应明确 `build.sourcemap=false` 并在 CI 中验证。

### V3A-1 Backend Scanner Candidate Engine

- ✅ 新增后端 candidate engine：
  - `server/src/domain/scanner/candidateEngine.cjs`
  - 说明：当前先用一个受测模块完成 immediate core；`candidateRules`、`candidateScoring`、`candidateEconomics`、`candidateDto` 的内部拆分作为后续可维护性重构，不阻塞浏览器隔离。
  - `server/src/domain/scanner/candidateRules.js`
  - `server/src/domain/scanner/candidateScoring.js`
  - `server/src/domain/scanner/candidateEconomics.js`
  - `server/src/domain/scanner/candidateDto.js`
- ✅ 从 `frontend/src/lib/scanOpportunity.js` 迁移以下逻辑到后端：
  - supported strategy list；
  - preset → DTE/Delta/spread/OI/Volume/liquidity/risk 参数映射；
  - actual contract enumeration；
  - same-expiry / cross-expiry strategy rules；
  - credit/debit、max loss、breakeven、return-on-risk；
  - candidate score；
  - fail-closed reason；
  - unique candidate key；
  - duplicate candidate elimination；
  - rank/sort default order。
- ✅ 前端保留内容（2026-07-17 按代码校准为完成）：
  - preset selector：`frontend/src/pages/Scan.jsx` `STRATEGY_PARAMETER_PRESETS` 只提供过滤输入默认值，不含评分权重；
  - advanced filter inputs、display labels/tooltips、selected sort state、row navigation、UI-only formatting 均在前端；
  - `toScanRow` 只做 server 字段到视图字段的重命名；`economicsSummary` 的 `* 100` 是展示用合约乘数，不是经济性计算；
  - `frontend/src/lib/scanOpportunity.js` 已删除，全前端无引用。
- ✅ 前端不再包含：
  - hidden default strategy thresholds；
  - scoring weights；
  - candidate enumeration；
  - complete strategy economics engine；
  - raw option chain traversal。
- ✅ API contract（2026-07-17 按代码校准为完成，两处命名差异记录在下）：
  - request：`preset` 展开为具体 filter、`strategies` → `strategyTypes[]`、advanced filters、`sort`、`limit` 均已实现于 `server/src/routes/scan.js`。
  - response：`scan.js` 在序列化前 destructure 掉 `option_contracts` 与 `payload`，浏览器只收到 candidate DTO。
  - 已包含：symbol、spot（`price_close`）、iv/hv summary、direction（trend_*）、positioning summary（GEX/wall/PCR/max pain）、strategy、legs、expiry/DTE、credit/debit、max loss、breakeven、score、freshness。
  - 命名差异（已接受，不再单列为未完成）：`reason` 由 `summary` / `pricing` / `structure` 承担；DTO 无单一 `reason` 字段。
  - 剩余真实缺口已移入 `V3A-4`：earnings risk 目前只返回原始 `earnings_date`，warning 判定仍在 `Scan.jsx` 前端计算。

### V3A-2 Materialized Candidate Snapshots

- [ ] 新增 PostgreSQL additive tables：
  - `scanner_candidate_batches`
  - `scanner_candidate_snapshots`
- [ ] `scanner_candidate_batches` 字段：
  - `id`
  - `scan_key`
  - `algorithm_version`
  - `source_snapshot_cutoff`
  - `universe_count`
  - `candidate_count`
  - `started_at`
  - `completed_at`
  - `status`
  - `error`
- [ ] `scanner_candidate_snapshots` 字段：
  - `batch_id`
  - `candidate_key`
  - `symbol`
  - `strategy`
  - `strategy_family`
  - `expiry`
  - `dte`
  - `spot`
  - `score`
  - `rank`
  - `legs_json`
  - `economics_json`
  - `signals_json`
  - `freshness_json`
  - `created_at`
- [ ] Additive migration only；不得删除现有 `scanner_results_snapshots`。
- [ ] Materializer：
  - 新增 `server/src/jobs/materializeScannerCandidates.js` 或 collector-side equivalent。
  - 读取 latest option snapshot、GEX snapshot、IV/HV metrics、price trend、earnings。
  - 写入 batch + candidate rows。
  - `algorithm_version` 每次改变排序/评分/候选逻辑必须递增。
- [ ] API read path：
  - `/api/scan` 或新 `/api/v1/scanner/candidates` 读取 latest completed batch。
  - stale batch 仍返回真实候选并标记 batch age。
  - missing batch enqueue materialization job，不同步全市场 provider fetch。

### V3A-3 Remove Raw Option Chain From Normal Scanner API

- ✅ 普通 scanner API 不返回 `option_contracts`。
- ✅ 新增 internal/admin chain endpoint（E12，2026-07-17 完成）：
  - `server/src/routes/adminChain.js` → `GET /api/admin/chain/:symbol`，挂在 `/api/admin/chain`，复用 `requireAdminToken`（未配置 `ADMIN_API_TOKEN` 返回 503、无/错 token 401、`timingSafeEqual` 比较）。
  - 返回最新 snapshot metadata + 全量原始 contract（`bid/ask/greeks/oi/con_id/provider_contract_id`，limit 1-5000，默认 1000）+ **从返回行重算的诊断**：`quoted_contract_count`、`has_usable_quotes`、missing greeks/oi count+ratio、expiry 列表。诊断按响应实际内容算，不只复述 stored summary。
  - 用途：debug、coverage、data-quality inspection——普通 `/api/scan`、`/api/analyze` 已不返回完整链，运维需要一个认证入口看原始数据。
  - Tests：`server/test/adminChainRoute.test.js` 7 个（未配 token→503、错 token→401、返回原始链+重算诊断、无可用报价显式标记、missing snapshot、非法 symbol 400、limit 封顶）。
  - 验证：server 121/121（114 → 121）。真实 runtime（2026-07-17，`ADMIN_API_TOKEN` 本地注入）：无/错 token 均 401；正确 token 返回 AAPL 最新 `polygon_licensed` snapshot、66 contracts、Greeks/OI 完整但 `has_usable_quotes=false`——正是该端点要暴露的覆盖缺口（链存在但无 bid/ask）。
  - 部署前置：Railway 注入 `ADMIN_API_TOKEN`（与 E1 同一 token）。未注入时该端点 503,不影响产品路径。
- ✅ 前端 scanner row 只渲染 backend candidate DTO。
- ✅ 删除或停用前端对 `row.option_contracts` 的依赖。
- ✅ 测试必须覆盖：
  - `/api/scan` response body 不包含 `option_contracts`。
  - candidate legs 均来自真实 persisted contract snapshot。
  - 不存在实际合约时不生成策略。
  - same-expiry 策略不会跨 expiry 拼接。
  - credit spread 不会用负 credit 伪装成可卖结构。

### V3A-4 Backend Analyze DTO（E10，后端 2026-07-17 完成；前端切流与 E11 一并）

- ✅ 新增后端 analyze domain：
  - `server/src/domain/analyze/positioningSummary.js`：GEX/Wall 结论文案 + 结构化字段 + unavailable 原因。`compactMoney`/`isUsableGex` 逐字移植自 `analyzeData.js`，usable 情况下结论字符串与旧客户端**逐字节一致**（已交叉验证）。
  - `server/src/domain/analyze/scenarioEngine.js`：从 walls + price 生成 up/down trigger/target，含 3% 最小距离下限（防止 wall 贴现价时情景塌缩为零宽）。
  - `server/src/domain/analyze/analyzeDto.js`：组装统一 DTO；普通用户降级 provider 名，admin 保留 provenance。
  - recommendation 复用已在服务端的 `GET /api/analyze/:symbol/candidate`（不重复造引擎），DTO 以 `recommendation_ref` 指向它。
- ✅ `GET /api/analyze/:symbol/summary` 返回统一 product DTO：`data_status`（用户向标签）、`positioning`（结论/regime/walls/pcr/max_pain/gamma_flip 或 unavailable_reason）、`scenarios`、`recommendation_ref`；admin token 额外带 `provenance`。freshness 走 E5 的 `freshness.js`,与其他端点口径一致。
- ✅ provider/source 对普通用户降级：`dataStatusLabel` 输出 `数据更新于11分钟前` / `延迟行情 · 3小时前` / `刷新中` / `正在准备数据`,**不含任何 provider 名**;有测试断言 `polygon_licensed`/`ib_internal`/`tt_internal`/`tastytrade` 均不出现。
- ✅ 保留 admin/debug provenance：合法 `ADMIN_API_TOKEN` 时 DTO 带 `provenance`（source、provider_status、snapshot_ts、confidence、model_version）。
- ✅ Tests：`server/test/analyzeSummary.test.js` 11 个（compactMoney 与客户端一致、legacy model 不 usable、结论逐字节、unusable 给原因不造 wall、legacy 与 unusable 区分、情景 wall 触发 + 距离下限、缺 wall 返回 null、标签不泄露 provider、normal 隐藏/admin 保留 provenance、recommendation_ref）+ `analyzeRoute.test.js` 新增 2 个（route 组装、无 GEX 返回 unavailable）。
- ✅ 验证：server 134/134（121 → 134）。真实 runtime（2026-07-17，直连 Railway）：`GET /api/analyze/AAPL/summary` 普通用户返回 `正Gamma $348M，Call Wall $340.00 / Put Wall $330.00…`、scenarios `{340,350,330,320}`、`data_status=数据更新于2小时前`、无 provenance;带 admin token 额外返回 `provenance.source=polygon_licensed`。
- [ ] **前端切流（与 E11 一并，受 E13 同一 visual-verification 限制）**：`analyzeData.js` 的 `applyGex` 目前同时产出图表数据（gexByStrike/walls/gexMeta）和结论/情景,二者交织在同一函数;把结论/情景改读 `/summary` 需跨 4 个调用点重构,且 Analyze 页渲染无法在本环境自动截图验证。故前端切流与 E11 stale-while-refresh 一并做,按项目既有标准（ESLint + 单测 + 生产 build + 人工浏览器验证）交付。后端逻辑已就绪且可调用——IP 保护的实质（结论逻辑离开浏览器）在服务端已成立。

### V3A-5 Auth, Entitlement, And Fail-Closed Production Gate

- [ ] **前置：启用 Clerk 前必须先扩展 CSP**（2026-07-17 由 E2 引入）。
  - `frontend/vercel.json` 的 CSP 目前只允许自有 bundle、`logo.clearbit.com` 和 Railway API。当前 `VITE_CLERK_PUBLISHABLE_KEY` 未配置，`ClerkProvider` 不挂载，因此 CSP 与现状一致且已验证。
  - 一旦注入 Clerk key，登录会被 CSP 静默阻断，除非同时扩展：`script-src`、`connect-src`（Clerk frontend API 域名）、`img-src`（头像）、`worker-src`、`frame-src`（bot 保护）。
  - 必须按 Clerk 官方文档和**真实实例域名**填写，并以一次真实 sign-in 验收，而不是照抄猜测的 host。E2 明确拒绝猜测这些值。
  - Stripe 目前是 hosted checkout 重定向，不加载前端 JS；若将来引入 Stripe.js，需同时扩展 `script-src` 与 `frame-src`。

- [ ] Production auth defaults：
  - production 环境默认 `AUTH_ENFORCEMENT_ENABLED=true`。
  - 缺 Clerk/Stripe required env 时 production startup fail closed 或 paid routes 503。
  - local/dev 可显式关闭 enforcement。
- [ ] API route classification：
  - public：`/health`、billing webhook、必要的 landing/public market summary。
  - authenticated free：account、learn/progress、有限 analyze preview。
  - paid/pro：scanner candidates、alerts、portfolio、full analyze、weekly depth。
  - admin/service-token：status detail、provider jobs、raw chain snapshots、heartbeat operations。
- [ ] Tests：
  - production env + missing Clerk key 不得开放 paid API。
  - unauthenticated scanner returns 401/403 when enforcement true。
  - free user cannot access pro scanner candidates。
  - admin status requires admin/service token。

### ✅ V3A-6 Internal Status And Operational API Separation（E1，2026-07-17 完成）

- ✅ 保留 `/health` 为 minimal public health：仍只返回 `{status:'ok'}`，无 provider、job 或 row count 细节。
- ✅ 新增 `/api/admin/status/{data,options,cache}`（`server/src/routes/adminStatus.js`）：provider usage、recent failures、job backlog、scanner batch age、option snapshot coverage 与 stale/running job 诊断全部保留在此，需 `ADMIN_API_TOKEN`。
- ✅ Existing 端点分类：
  - public product-safe summary：`/api/status/data` 只返回 `status`、`generated_at`、`latest_date`、`expected_count`、`expected_symbols`、`universe.scan_enabled_count`。审计前端后确认只有 `expected_symbols` 被 Scan/Weekly/Analyze 真正消费。
  - admin-only operational detail：`/api/admin/status/*` 与 `GET /api/heartbeat/status`。`POST /api/heartbeat` 继续用 collector 的 `HEARTBEAT_TOKEN`，与 `ADMIN_API_TOKEN` 是不同密钥、不同调用方。
- ✅ 实现边界：`server/src/domain/status/statusReports.js` 提供 admin/public 共用的 builder；`toPublicDataStatus()` 是降级给未认证客户端的唯一通道，移除 `source_counts`、逐 symbol `source`、`missing/stale_symbols`、`price_history` 覆盖明细与 `extra_symbols`。
- ✅ `requireAdminToken`（`server/src/lib/adminAuth.js`）fail closed：未配置 `ADMIN_API_TOKEN` 返回 503 而非放行；`crypto.timingSafeEqual` 比较；接受 `Authorization: Bearer` 或 `X-Admin-Token`。
- ✅ Tests（`server/test/adminStatusRoute.test.js`，5 个）：
  - public status 不泄露 `tastytrade` / `polygon_licensed` / `ib_internal` / `tt_internal`，且不含 6 个运维字段。
  - admin status 未配置 token → 503；无 token / 错 token / 等长错 token → 401。
  - admin status 正确 token（两种 header）→ 通过。
  - admin report 仍保留 public 视图丢弃的运维明细。
- ✅ 验证：server 94/94 通过（89 → 94）；frontend 40/40、full ESLint 0 errors/0 warnings、Vite production build 通过（仅既有 chunk-size 警告）。前端无改动即兼容，因为它只读 `expected_symbols`。
- [ ] 部署前置：Railway 注入 `ADMIN_API_TOKEN`（`openssl rand -hex 32`，勿复用 `HEARTBEAT_TOKEN`）。未注入时运维端点返回 503，产品路径不受影响。

### V3A-7 Database Permission Boundary

- [ ] 拆分数据库 roles：
  - migration owner：DDL only；
  - collector writer：insert/upsert snapshots and jobs；
  - API reader：read product views/candidate snapshots；
  - admin/service：operational status and controlled maintenance。
- [ ] Normal API 不直接拥有 raw provider payload write permissions。
- [ ] Product-facing SQL 优先读 views/materialized product tables：
  - `scanner_candidate_snapshots`
  - `symbol_data_state`
  - `gex_snapshots`
  - derived read models。
- [ ] Tests/deployment checks：
  - API role cannot write raw option snapshots。
  - collector role cannot read user billing data。
  - migration role credentials never configured in runtime API service。

### V3A-8 Shared Cache And Rate Limit Layer

> **托管决策已明确（2026-07-17）**：若引入 Redis，直接用 **Railway Redis**（New → Database → Redis，同 project 内网、并入 Railway 账单），**不用 Upstash**——全套已在 Railway,内网互通、少一个第三方账号。Upstash 只在 Vercel serverless 函数直连场景才更优,不是本架构。
>
> **现阶段是否需要 Redis：否。** provider 限流与预算协调已由 E7 用 PostgreSQL 实现并在生产验证；API 缓存目前是进程内 `server/src/lib/cache.js` 的 `Map`,单实例完全够用。Redis 的唯一增量价值是**多实例部署后**的共享缓存/限流,而多实例只在有付费用户、并发上来后才发生。届时:在 Railway 加 Redis 服务 + 把 `cache.js` 改为"有 `REDIS_URL` 就用 Redis、否则退回 Map"即可,是 1-2 小时的向后兼容改动,不是 blocker。

- [ ] （多实例前不做）引入 Railway Redis 或继续用 PostgreSQL-backed shared state：
  - API response cache；
  - per-user/IP rate limits；
  - provider budget/rate coordination（已由 E7 覆盖）；
  - stale-while-refresh polling state。
- [ ] 保留 PostgreSQL 为 source of truth；Redis 只做 cache/coordination。
- [ ] Rate limits：
  - anonymous/public endpoints tight。
  - authenticated free tier bounded。
  - paid tier higher。
  - admin/service tokens separately limited。
- [ ] Anti-enumeration：
  - unknown symbol requests require debounce/cooldown。
  - bulk scanner export not exposed through public API。
  - pagination limits enforced server-side。
- [ ] Tests：
  - repeated unknown symbol requests do not enqueue unlimited jobs。
  - scanner pagination limit cannot be bypassed。
  - stale cache is labeled, not silently treated as fresh。

### ✅ V3A-9 Frontend Production Hardening（E2，2026-07-17 完成）

- ✅ `frontend/vite.config.js` production build explicitly sets `build.sourcemap=false`。
- ✅ CI/build verification checks no `.map` files in production artifact：
  - `frontend/scripts/check-dist.mjs`（`npm run check:dist`）断言 artifact 本身，不信任配置：拒绝 `.map` 文件、内联 `sourceMappingURL=data:` 以及 8 类 provider secret pattern（Polygon/Clerk/Stripe/TT/DB URL/VAPID/admin token）。
  - 反向验证：注入伪造 `.map` 与伪造 `POLYGON_API_KEY` 后均正确 exit 1；干净 artifact exit 0。门必须能失败才算门。
- ✅ Remove unused mock modules from production import graph：
  - 全仓已无 `*mock*` 文件；`mockAnalysis` / `weeklyMock` 均已删除。
  - `Mock` 字样只出现在两个测试文件中，不进入生产 import graph。
- ✅ Security headers（`frontend/vercel.json` + `server/src/lib/securityHeaders.js`）：
  - 前端：CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、HSTS。
  - API：`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`（只出 JSON，不加载任何资源、不该被 frame）、nosniff、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Cross-Origin-Resource-Policy: same-site`；移除 `X-Powered-By`；HSTS 仅 production。
  - Runtime 验证：`NODE_ENV=production` 起服务 curl `/health`，六个 header 全部实际下发，`X-Powered-By` 不存在。
- ✅ Do not display internal source names in normal product UI：
  - 审计结论：目前**没有任何** provider 名被渲染。所有 `source` 字段都只写进 view model 后无人读取，或只用于 `freshness`/`isStale` 等兄弟字段的条件判断。
  - 已移除 `Scan.jsx` 中完全无消费者的 `dataMeta`（携带 `row.source`、`row.price_source`、`row.quote_source` 三个原始 provider 字符串进入组件 props）。
- ✅ Tests:
  - production build contains no source maps → `check:dist`，CI 强制。
  - `frontend/src/lib/providerDisclosure.test.js`：生产代码不得硬编码 `polygon_licensed` / `ib_internal` / `tt_internal` / `tastytrade` / `stooq`；`DataDetails` 不得读取 `data_state.source`；scanner row 不得携带原始 provider 字符串。
  - `server/test/securityHeaders.test.js`：baseline header 齐全；HSTS 仅在 production 下发。
- ✅ CI（`.github/workflows/ci.yml`，此前仓库完全没有 CI）：四个 job —— server tests、frontend lint/test/build/check:dist、collector unittest（Python 3.11，环境置空以确保不读 `.env`、不触达 provider）、`scripts/scan-secrets.sh`。
  - `scan-secrets.sh` 保留 docs 在扫描范围内（Polygon key 曾进入 Git 历史，正是文档类泄露），改为过滤占位符而不是跳过文件。反向验证：4 类真实 secret 全部捕获，`YOUR_PASSWORD@` 占位符正确放行。
- ✅ 验证：server 96/96（94 → 96）；frontend 43/43（40 → 43）；full ESLint 0 errors/0 warnings；production build 通过（仅既有 chunk-size 警告）；collector 130/130。

**已知边界（不要当作已完成）**：

- CSP 的 `script-src`/`connect-src` 目前只覆盖当前实际运行的应用：自有 bundle、`logo.clearbit.com` 图片、Railway API。**Clerk 尚未包含**——当前未配置 `VITE_CLERK_PUBLISHABLE_KEY`，`ClerkProvider` 根本不挂载，且无法对真实 Clerk 实例域名做验证。启用 Clerk 前必须扩展 CSP，见 V3A-5 / P3 的对应前置项。宁可留下明确前置，也不猜测 Clerk host 而发布一个未经验证、会静默打断登录的 CSP。
- `providerDisclosure.test.js` 是静态断言（测试运行器无 JSX transform，全仓测试均为源码文本断言）。它能挡住硬编码的 provider 名和 `DataDetails` 长出 source 字段，但**不能证明**运行时值永远不会被渲染——这些字符串来自 API。真正的根治是服务端对普通用户降级 provider/source，见 V3A-4 / E10。

### V3A-10 Worker And Runtime Boundaries

- [ ] Keep deployment units separated:
  - Vercel：frontend only。
  - Railway API：Express API only。
  - Railway worker/scheduler：Polygon/data materialization only。
  - Mac Studio：IB Gateway internal collector only。
  - PostgreSQL：snapshots/read models/jobs/user data。
  - Redis/shared cache：rate limit/cache/coordination。
- [ ] API service must not run collector loops。
- [ ] User request must not synchronously depend on Mac Studio。
- [ ] Provider jobs:
  - `ingest_option_chain`
  - `derive_gex`
  - `derive_oi_delta`
  - `materialize_scanner_candidates`
  - `materialize_analyze_summary`
  - `materialize_weekly_summary`
- [ ] Job records must include:
  - input snapshot id；
  - algorithm version；
  - provider；
  - dedupe key；
  - priority；
  - retry/backoff state。

### V3A-11 Rollout Plan

- ✅ Step 1：后端实现 candidate engine；以迁移后的同一回归测试集验证行为一致。未新增独立 shadow compare job。
- [ ] Step 2：写入 `scanner_candidate_snapshots`，但 `/api/scan` 暂不切流。
- ✅ Step 3：增加 API contract tests，确保 candidate DTO 完整且不返回 raw chain。
- ✅ Step 4：前端 Scanner 改读 backend candidate DTO。
- ✅ Step 5：删除前端 candidate enumeration/scoring 依赖。
- [ ] Step 6：Analyze recommendation/narrative 迁移到 backend DTO。
- [ ] Step 7：internal status/admin endpoint 拆分。
- [ ] Step 8：production auth fail-closed gate。
- [ ] Step 9：DB role split 与 deployment secret rotation。
- [ ] Step 10：Redis/shared limiter/rate limit 接入。

### V3A-12 Verification Requirements

- ✅ Unit tests（immediate core scope）：`server/test/candidateEngine.test.js` covers DTE/Delta/spread/OI/Volume gates、same-expiry validation、credit/debit economics、scoring order and fail-closed missing legs. Candidate dedupe persistence remains V3A-2 work.
- ✅ API tests（immediate core scope）：scanner returns candidate DTO and never returns `option_contracts`.
- [ ] API tests still required for stale batch behavior, missing-batch materialization and auth/entitlement paid gates.
- [ ] Frontend tests：
  - scanner renders backend DTO；
  - sorting works after repeated clicks；
  - no raw source names in normal UI；
  - stale/queued/missing UX stays user-friendly。
- ✅ Build/security tests（immediate core scope）：no source maps in production artifact；no frontend import of candidate scoring engine。
- [ ] Build/security tests still required: no secrets in bundle；route entitlement matrix passes。
- [ ] Runtime evidence：
  - command；
  - git commit；
  - algorithm version；
  - candidate batch id；
  - candidate count；
  - symbols covered；
  - stale count；
  - response payload sample without raw chain；
  - rollback command/path。

### V3A-13 Rollback

- [ ] Candidate engine rollout must be reversible:
  - keep old `scanner_results_snapshots` read path until backend candidate DTO is verified。
  - feature flag：`SCANNER_CANDIDATE_ENGINE_ENABLED`。
  - rollback：disable flag and read previous scanner materialized rows。
- [ ] Additive DB tables can remain after rollback。
- [ ] Auth enforcement rollback:
  - local/dev can set `AUTH_ENFORCEMENT_ENABLED=false`。
  - production rollback must be explicit and documented because it changes commercial access control。
- [ ] Frontend rollback:
  - keep UI compatible with backend DTO and previous scanner row shape for one release if needed。

### V3A-14 Deployment Readiness

- [ ] Do not deploy commercial paid launch until:
  - scanner candidate generation no longer runs in frontend；
  - normal scanner API no longer returns raw option contracts；
  - paid APIs are auth/entitlement gated；
  - internal status/provider details are admin-only；
  - production sourcemaps are disabled；
  - data freshness/stale/queued states are visible to users；
  - rollback flag and previous read path are verified。

---

## 🏗️ V3 — Product
- [ ] User authentication（Clerk）
  - ✅ Express `clerkMiddleware`、JSON 401/503 guard、authorized parties、`/api/account/me`
  - ✅ React conditional `ClerkProvider`、SignIn/UserButton、`/account` route；无 key 时不挂载 SDK
  - ✅ Tests/build：server 43/43、frontend 19/19、Vite build passed
  - [ ] Railway/Vercel 注入 Clerk publishable/secret keys 并完成真实 sign-in 验收
    - 同一步必须先扩展 `frontend/vercel.json` 的 CSP，否则 Clerk 会被 CSP 静默阻断；见 V3A-5 前置项。
- [ ] 订阅分层: 免费（教育工具）/ 付费（scanner + alerts + live data）
  - ✅ Free/Pro plan catalog 与 bounded entitlements 已写入 account API
  - ✅ scanner/alerts/live/portfolio routes 已接入 entitlement middleware；`AUTH_ENFORCEMENT_ENABLED=false` rollout gate
  - ✅ Frontend API bridge 为所有数据请求附加 Clerk bearer token，避免登录用户仍被 401
  - [ ] 配置 Clerk/Stripe、完成 webhook lifecycle 后将 production enforcement 改为 true
- ✅ Portfolio dashboard：Clerk-owned CRUD、multi-leg positions、真实 contract snapshot mark、实际 P/L 与 aggregate Delta/Gamma/Theta/Vega（2026-07-15）
  - ✅ Missing quote fail closed：position/summary 显示 `待报价`，不以 entry price 伪装 current mark
  - ✅ Ownership：所有 list/create/close SQL 绑定 authenticated local user id
  - ✅ Tests/build：server 46/46、frontend 21/21、Vite build passed
- ✅ PostgreSQL: users / subscriptions / positions 表
  - ✅ `users` / `subscriptions` additive schema 已实现；新 Clerk user 自动获得 free subscription
  - ✅ Railway migration：2026-07-15 执行成功；只读确认 `users`、`subscriptions`、`positions`、`position_legs`、`stripe_webhook_events` 全部存在
  - ✅ `positions` / `position_legs` schema 与 ownership indexes 已实现
- [ ] Payment integration（Stripe）
  - ✅ Checkout subscription、Customer Portal、signed raw-body webhook、Free/Pro lifecycle mapping
  - ✅ `stripe_webhook_events` event-id idempotency；plan 只由 signed subscription webhook 更新
  - ✅ Tests/build：server 56/56、frontend 21/21、Vite build passed
  - [ ] 提供 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRO_PRICE_ID` 并完成 test-mode checkout/webhook/portal 验收
- ✅ Custom domain 配置：`quantrift.io` 308 → `www.quantrift.io`，www HTTP 200

---

## 🗄️ 已完成归档（早期阶段，全部完成 — 内容原样保留，仅挪至文末以减少与进行中工作混杂）

## ✅ Done (V1 Core)
- ✅ Project scaffolding: React + Vite + Zustand
- ✅ Documentation: CLAUDE.md, README.md, wiki.md, learning.md, task.md
- ✅ Black-Scholes engine: pricing + Delta/Gamma/Theta/Vega/Rho + POP + BEP
- ✅ Strategy data: 86 strategies, 7 categories, 9-field notes each（系统按卖方框架补强）
- ✅ App layout: 3-column dark theme (sidebar / main / right panel)
- ✅ Sidebar: search, category filter, strategy list, ↑↓ keyboard navigation
- ✅ Payoff chart: Canvas, expiry + scenario lines, BEP markers, fill zones
- ✅ Greeks six-chart: Risk/Theta/Delta/Vega/Gamma/Rho with DTE slider (4 time lines)
- ✅ Scenario panel: spot / IV shift / rate / div / range / contracts
- ✅ Risk metrics: Max P/L, BEP, POP, Delta, Theta, Vega, Gamma, Rho (12 metrics)
- ✅ Leg editor: add/edit/remove legs, real-time chart update
- ✅ Strategy notes: 9-card grid (build/when/strike/IV/DTE/delta/TP/SL/adj)
- ✅ Unlimited profit/loss detection for naked options
- ✅ Greeks 知识库页面（5大 Greek + 6个 Interaction 卡片）
- ✅ 知识库扩展：GEX、Gamma Squeeze 实战案例、Vanna/Charm、OpEx Pin Risk、Vol Skew、期权卖方系统化框架
- ✅ 期权实战交易框架记录（卖方哲学、Tastytrade 规则、Vol Risk Premium）→ learning.md
- ✅ 数据库/基础设施决策：PostgreSQL on Railway（放弃 DuckDB）

## ✅ Done (V2 Scaffold — historical, superseded by the real-data paths below)
- ✅ React Router 多页路由：/learn、/analyze、/scan
- ✅ NavBar 组件：页面导航
- ✅ /learn：V1 所有组件完整保留（Learn.jsx）
- ✅ /analyze：标的分析页的初始 UI scaffold（当时使用示例数据；现已由真实数据路径与 fail-closed 状态取代）
- ✅ /scan：扫描器页的初始 UI scaffold（当时使用示例数据；现已由 `/api/scan` 候选 DTO 取代）
- ✅ 历史示例数据：9 个标的；不再作为生产 Analyze/Scan 的 fallback
- ✅ Analyze ↔ Scan 联动：扫描器点击行自动填入并分析

## ✅ Done (Phase 1 — /analyze 4-Tab UI)
- ✅ /analyze 重构为 4-tab 布局（Tab 导航 + URL 状态 ?tab=0-3）
- ✅ Tab 1 今日概览：sector chips、3个 Q&A 卡片、conclusion card、badge 组（格局/动量/信号/GEX）、剧本 playbook、推荐卡
- ✅ Tab 2 日内变化：Kalman Filter 趋势图 Canvas、Trend Spread 动量柱、输出 badge、3格辅助信息（趋势格局/期权结构/RVol）
- ✅ Tab 3 数据解读：GEX by Strike Canvas（带 Put/Call Wall 竖线、当前价箭头）、3 核心数字（GEX Total/PCR/IV ATM）、Unusual Activity 列表、结论文本
- ✅ Tab 4 信号追踪：筹码标尺 Canvas（竖向密度图）、上方压力/下方支撑卡、观察结论
- ✅ mockAnalysis.js 扩展：9 标的增加 sector/gexTotal/gexByStrike/putWall/callWall/pcr/unusualActivity/trend/conclusion/scenarios 字段
- ✅ Canvas 全部支持 devicePixelRatio + ResizeObserver（Retina 适配）

## ✅ Done (Phase 2 — /weekly Weekly Recap UI)
- ✅ /weekly 路由 + /weekly/:symbol 参数路由（App.jsx + NavBar）
- ✅ Weekly.jsx：5段导航（?sec=0-4）、prev/next 按钮、进度计数；`/weekly` 默认加载 SPY，顶部保留常用标的快捷入口并支持输入任意有效标的代码。
- ✅ Weekly 真实数据：`/api/weekly/:symbol` 返回 rolling 5-session OHLC、每日实际 GEX history、Max Pain、ΔOI 与条件剧本；`weeklyMock.js` 已删除
- ✅ Sec1 本周定调：K线图 Canvas（5根OHLC）+ CME Gauge Canvas（半圆弧仪表盘）、定调文字
- ✅ Sec2 Gamma迁徙：星期选择器、GEX 日内图 Canvas（随天切换）、Call/Put Wall 迁移表
- ✅ Sec3 交割偏离：MaxPain vs FridayClose 偏离条形图、偏离 badge（中性/警告/空方）
- ✅ Sec4 仓位变化：真实 ΔOI 日汇总；明确不将 OI 变化伪装成美元资金流或机构方向
- ✅ Sec5 下周分叉：多头/空头剧本卡片（触发条件/价格目标/观察重点）
- ✅ index.css：新增 ~170行 Phase 1 样式 + ~200行 Phase 2 样式（.wk-* 类）
- ✅ /weekly 全量数据化：不再按 symbol fallback mock；每个 module 对真实字段独立 fail closed

## ✅ Done (Infrastructure)
- ✅ Git repo 初始化，branch: master
- ✅ GitHub repo: whicter/quantrift_options-lab
- ✅ Mac Studio: /Users/congrenhan/Documents/quantrift_options-lab（SSH push）
- ✅ 本机: /Users/cohan/Documents/quantrift_options-lab（HTTPS pull）
- ✅ 工作流确认：本机开发 → rsync → Mac Studio push
- ✅ 项目结构重组：frontend/ + server/ + collector/ 单 repo
- ✅ server/：Node.js Express API（/api/metrics, /api/scan, /health）
- ✅ collector/：Python IV 采集脚本（auth.py + collect.py，Tastytrade → PostgreSQL）
- ✅ 代码已同步至 GitHub（本机 → Mac Studio → push）
- ✅ .claude/settings.json：Bash(*) 全放行白名单
- ✅ .claude_session：session UUID 固化，`cr` 命令一键恢复对话

## ✅ Done (Phase 3A — UI Polish)

> 参考截图：华尔街咖啡馆 MRVL/META 盘中即时分析 + Nokia 周复盘
> 完成于 2026-07-13

- ✅ **GEX 发散柱图**：已确认 Tab3Options + Sec2Gamma 均已是从零轴向两侧延伸的发散柱，无需修改
- ✅ **时间轴滑块（/weekly Sec2）**：Mon-Fri 按钮改为横向轨道 + 5个节点，当前日期蓝色高亮，CSS `.wk-timeline-*`
- ✅ **底部解读条**：Tab1/2/3/4 底部均加 `InsightCarousel`，新建 `components/InsightCarousel.jsx`，静态全部展示，黄色高亮
- ✅ **PCR 拆分（Tab3）**：mockAnalysis.js 加 `pcrVol`（9个标的），Tab3 数字格从3格扩展为4格（GEX/PCR OI/PCR Vol/IV），CSS `.az-gex-numbers-4`
- ✅ **公司信息增强**：新建 `data/companyInfo.js`（12个标的，含中文名/英文全称/logo/tagline）；/analyze header 显示 logo + 中文名；/weekly Sec1 显示大 logo + 中文名
- ✅ **价格区间 chip（Tab4）**：顶部显示 `$putWall ~ $callWall` 金色圆角徽章，CSS `.az-price-range-chip`
- ✅ **Tab4 筹码标尺重做**：bar 高度改为动态适配（相邻 strike 间距一半），bars 连续填充无空隙，渐变填色 + 左边accent，形成真正的 OI 密度分布侧面图
- ✅ **InsightCarousel 改静态**：去除自动轮播/定时器，所有条目一次性全部展示

---

## ✅ Phase 3B-1 — Provider-first 价格历史闭环（IB internal + Tastytrade）

> 前置条件：Mac Studio PM2 直接运行当前 repo 的 collector
> 本 phase 最初以 `PRICE_PROVIDER=ib_internal` 建立 provider-first 闭环；2026-07-15 scheduled default 已由 P0.1 切为 `polygon`，IB/Stooq 仅保留显式 fallback。yfinance 不作为默认路径。

### 真实价格历史（趋势图）
- ✅ **collector 新增每日价格采集**：symbol → 60 天 OHLCV
  - 写入 Railway PostgreSQL 新表 `price_history (symbol, date, open, high, low, close, volume, source, created_at)`
  - 存储位置：数据库，不放前端 mock、不放本地 CSV；collector 每天按 watchlist upsert 最近 60 个交易日
  - ✅ `server/src/migrate.js` 新增建表语句；2026-07-14 已在 Railway PostgreSQL 创建 `public.price_history`
  - ✅ `collector/common.py`：共享 `watchlist.txt` loader
  - ✅ `collector/providers/base.py`：`PriceProvider` / `PriceBar` contract
  - ✅ `collector/providers/ib_price_provider.py`：IB Gateway internal adapter，source=`ib_internal`
  - ✅ `collector/providers/stooq_price_provider.py`：显式 dev/backfill adapter，source=`stooq`
  - ✅ `collector/collect_prices.py`：读取 watchlist 或 `SYMBOLS` override，按 provider upsert `price_history`
  - ✅ `collector/requirements.txt`：加入 `ibapi`
  - ✅ `collector/.env.example`：加入 `PRICE_PROVIDER`、`PRICE_HISTORY_LIMIT`、`IB_HOST`、`IB_PORT`、`IB_PRICE_CLIENT_ID`、`IB_TIMEOUT`、`SYMBOLS`
- ✅ **server 新增 `/api/prices/:symbol`** 端点：返回最近 60 天 OHLCV
  - ✅ `server/src/routes/prices.js`
  - ✅ `server/src/index.js` 挂载 `/api/prices`
  - ✅ `frontend/src/lib/api.js` 新增 `getPrices(symbol, limit)`
- ✅ **Tab2Trend.jsx 改用真实价格**：优先调用 `/api/prices/:symbol`，fallback 保留 LCG mock
  - KF 计算逻辑不变，输入换成真实价格数组
  - RVol = 当日成交量 / 20日均量（从 price_history 算）
- ✅ **Weekly Sec1 改用真实价格**：`/weekly/:symbol` 优先读取 `/api/prices/:symbol`
  - AAPL/SPY/QQQ 仍保留完整 5-section mock/GEX/flow 结构
  - 若有真实价格历史，则覆盖 Sec1 的 weekClose / prevClose / weekHigh / weekLow / 5日 K线
  - GEX / flow / Max Pain 仍需授权 options data，不能用 mock 伪装成真实

### 真实 IV（Tastytrade）
- ✅ **`/api/metrics?symbols=X` 已上线**，前端 /analyze 接入
  - Analyze.jsx 调用真实 API
  - 真实 IV Rank / IV30 / HV / earnings 覆盖 mock shell
- ✅ Analyze 缺失数据 UX：输入未采集标的不再提示固定 AAPL/SPY/QQQ；区分“在 watchlist 但尚未写入”和“不在 watchlist”
- ✅ Analyze 使用真实 `/api/metrics` 覆盖 IV Rank / IV30 / HV / earnings；GEX/趋势结构暂用现有展示壳
- ✅ Analyze price-only fallback：当 symbol 已有 `/api/prices/:symbol` 但 `/api/metrics` 缺失时，不再整页显示“暂无真实数据”
  - 2026-07-14 case：`PLTR`
  - Confirmed from production API：`/api/metrics?symbols=PLTR` 返回 `{}`，但 `/api/prices/PLTR?limit=3` 返回 `source=ib_internal`、`freshness=fresh`
  - UI behavior：显示真实价格、price history 趋势、`IV Rank 暂不可用`，并明确提示 IV / GEX / Walls / option chain 暂未接入
  - 不生成期权策略结论，不把 mock option analysis 伪装成真实数据
- ✅ Analyze button click bug fixed：`onClick={handleAnalyze}` 会把 click event 当成 symbol 传入，导致 `.trim()` 报错；改为 `onClick={() => handleAnalyze()}` 并防御非字符串参数
  - 2026-07-14 local UI smoke verified：输入 `AAPL` 点击分析显示 IVR；输入 `PLTR` 点击分析显示 price-only 结果

### 真实 RVol（price_history 量能）
- ✅ 从 `price_history` 的 volume 字段计算 RVol，替换 Tab2 中的 mock RVol（0.2x）

### Phase 3B-1 验证记录
- ✅ Python syntax verified：`collector/venv311/bin/python -m py_compile collector/collect.py collector/collect_prices.py collector/common.py collector/providers/base.py collector/providers/ib_price_provider.py collector/providers/stooq_price_provider.py`
- ✅ Node syntax verified：`node --check server/src/index.js`、`node --check server/src/routes/prices.js`
- ✅ Frontend build verified：`npm run build` in `frontend/`
- ✅ Collector runtime verified with IB Gateway：`SYMBOLS=AAPL collector/venv311/bin/python collector/collect_prices.py`，写入 60 rows，source=`ib_internal`
- ✅ Database verified：AAPL `price_history` = 60 rows，date range 2026-04-17 → 2026-07-14，source=`ib_internal`
- ✅ Local API verified：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 返回 3 rows，source=`ib_internal`
- ✅ Production API verified after deploy：2026-07-15 `GET /api/prices/AAPL?limit=3` 返回 HTTP 200、`freshness=fresh`

---

## ✅ Phase 3B-2 — 价格历史生产化与 UI 数据状态

### Collector 调度
- ✅ 在 Mac Studio 安装 `collect_prices.py` 定时任务
  - 当前实现：PM2 直接运行 `/Users/congrenhan/Documents/quantrift_options-lab/collector`，不维护第二份 runtime，不需要同步代码。
  - PM2 config：`collector/ecosystem.config.cjs`
  - App：`quantrift-options-prices`
  - Script：repo 内 `collector/collect_prices.py`
  - Python：repo 内 `collector/venv311/bin/python`
  - Schedule：Monday-Friday 13:35 PT / 16:35 ET
  - Environment：直接读取 repo 内 `collector/.env`
  - 旧 `com.quantrift.collect-prices` LaunchAgent、plist 和 `/Users/congrenhan/.quantrift_options_collector` 运行副本已停止并删除。
  - 启动命令：`pm2 start collector/ecosystem.config.cjs && pm2 save`
  - 验证命令：`pm2 status quantrift-options-prices`
- ✅ 跑完整 watchlist 一次 `collect_prices.py`
  - 成功 symbols 数量：67 / 67
  - 写入 rows：4020
  - 失败 symbols：无
  - 失败分类：无 IB contract 解析失败、无权限、pacing/timeout、symbol 格式问题
  - Railway DB 验证：`price_history` source=`ib_internal`，date range 2026-04-17 → 2026-07-14，所有 symbol 均 >=60 rows
- ✅ 为 `BRK.B` 等特殊 ticker 建立 symbol normalization 规则
  - 输入 symbol
  - IB contract symbol/localSymbol
  - UI display symbol
  - DB canonical symbol
  - 规则：DB/UI canonical symbol 保持原样；IB `Contract.symbol` 将 `.` 映射为空格，例如 `BRK.B` → `BRK B`

### Backend/API
- ✅ 部署 server 后验证生产 `/api/prices/:symbol`
  - `curl -f "https://quantriftoptions-lab-production.up.railway.app/api/prices/AAPL?limit=3"`
  - 返回字段必须包括 `symbol`、`source`、`count`、`latest_date`、`prices[]`
  - 2026-07-14 验证结果：HTTP 200，返回 `source=ib_internal`、`count=3`、`freshness=fresh`、`is_stale=false`
- ✅ `/api/status/data` 增加 price coverage 细节
  - watchlist 总数
  - `price_history` covered symbols
  - missing price symbols
  - stale price symbols
  - latest price date
  - source distribution
  - 2026-07-14 生产验证：`expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- ✅ `/api/prices/:symbol` 增加 freshness 字段
  - `snapshot_ts` 或 `latest_date`
  - `freshness`
  - `is_stale`
  - `source`

### Frontend
- ✅ Analyze header 显示价格数据状态
  - `price ib_internal 2026-07-14`
  - stale 时显示 `price stale`
  - missing 时不显示真实价格标记
- ✅ Tab2Trend 增加真实/示例走势标识
  - real：`price_history`
  - fallback：`示例走势`
  - 不把 fallback 说成真实数据
- ✅ Weekly Sec1 增加价格来源标识
  - real：显示 `price_history source + latest_date`
  - fallback：显示当前为示例 weekly shell
- ✅ Scan 结果增加 price coverage 状态
  - 已有 price_history
  - 缺失 price_history
  - stale price_history

### Verification
- ✅ Syntax verified：Python collector files
- ✅ Syntax verified：Node server routes
- ✅ Frontend build verified：`npm run build`
- ✅ Collector runtime verified：完整 watchlist run
- ✅ Historical LaunchAgent run verified on 2026-07-14；current runtime has migrated to PM2 direct-repository execution（见 Phase 3D-2B）
- ✅ Local API verified：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 返回 `freshness=fresh`、`is_stale=false`
- ✅ Local API verified：`curl -f "http://localhost:3002/api/status/data"` 返回 `price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- ✅ Production API verified：Railway `/api/prices/AAPL?limit=3`
  - 2026-07-14 结果：HTTP 200，`freshness=fresh`、`is_stale=false`
- ✅ Production status verified：Railway `/api/status/data`
  - 2026-07-14 结果：`expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`
- ✅ UI verified：`/analyze?symbol=AAPL&tab=1` 显示真实趋势（Playwright 自动化因环境报错未完成，功能已在生产手动验证）
- ✅ UI verified：`/weekly/AAPL?sec=0` 显示真实 5日 OHLCV（同上）

---

## ✅ Phase 3B-3 — Scanner 接入真实 IV + Price Coverage

### Backend/API
- ✅ `/api/scan` 限定 collector watchlist
  - 使用 `server/watchlist.txt` fallback，避免 Railway server-only 部署读不到 `collector/watchlist.txt`
  - 不再扫描 `iv_history` 中的 extra symbols
- ✅ `/api/scan` 返回 latest `price_history` 字段
  - `price_close`
  - `price_date`
  - `price_source`
  - `price_status`
- ✅ `/api/scan` 继续按真实 IV 数据筛选
  - `minIvr`
  - `maxIvr`
  - `minIvHv`
  - `limit`

### Frontend
- ✅ `frontend/src/lib/api.js` 新增 `getScan()`
- ✅ `Scan.jsx` 从 mock scanner 改为调用真实 `/api/scan`
- ✅ Scanner watchlist 显示来自 `/api/status/data`
- ✅ Scanner table 使用真实 price close 和 price coverage status
- ✅ Strategy filter 仍在前端基于 current recommendation 过滤
- ✅ Direction column 接入真实 `price_history` 派生趋势，不再显示 `待接入趋势`
  - `collector/materialize_scan.py` 从 `price_history` 计算 trend_score、trend_label、trend_signal、5D change、RSI14、MA20/50/200
  - `/api/scan` 从 `scanner_results_snapshots` 返回趋势字段，前端只读 materialized result

### Current Scanner Logic
- ✅ 当前 scanner 是 IV + price trend + GEX/OI snapshot 版，不是完整 options chain selector
  - `IV Rank >= 50` + bullish trend：`Bull Put Spread`
  - `IV Rank >= 50` + bearish trend：`Bear Call Spread`
  - `IV Rank >= 50` + neutral/missing trend：`Iron Condor`
  - `30 <= IV Rank < 50`：默认 `Iron Condor`，小仓位/定义风险
  - `IV Rank < 30`：默认 `Long Straddle`，只表示低 IV 适合观察买方波动结构，不代表已有事件催化
  - Historical behavior：POP 曾为规则占位值，不来自真实 option chain；Phase 3H-1 已从 scanner 表格删除该字段，改为明确标注的候选质量“机会分”
- ✅ 已写入文档：`docs/wiki.md`、`docs/learning.md`

### Verification
- ✅ Node syntax verified：`node --check server/src/routes/scan.js`
- ✅ Frontend build verified：`npm run build`
- ✅ Local API verified：`curl -f "http://localhost:3002/api/scan?minIvr=0&maxIvr=100&limit=10"`
  - 返回真实 Tastytrade IV rows
  - 返回 `price_close` / `price_source=ib_internal` / `price_status=covered`
  - 结果限定在 watchlist 内
- ✅ Production API verified after deploy：Railway `/api/scan?minIvr=0&maxIvr=100&limit=5`
  - 2026-07-14 verified HTTP 200
  - 返回 rows 限定在 watchlist 内，不再包含 extra symbols such as `NFLX`
  - 返回 `price_close` / `price_source=ib_internal` / `price_status=covered`
- ✅ UI verified：`/scan` 点击立即扫描显示真实 rows
  - 2026-07-14 Playwright Core + local Chrome smoke verified `https://www.quantrift.io/scan`
  - 操作：打开 `/scan` → 点击 `立即扫描`
  - 页面显示 `找到 8 个标的`，可见 rows 包含 `AMD` / `META` / `GOOGL`
  - `/api/scan` response row count = 8，payload 包含 `source=tastytrade`、`price_source=ib_internal`、`price_status=covered`

---

## ✅ V1 Backlog (Polish)
- ✅ Strategy comparison mode (side by side, 2 strategies)（策略库可选择任意两个策略，并排展示方向、风险级别、DTE、IV、TP/SL 与实际 legs；不会改变当前主策略）
- ✅ IV Rank badge per strategy in sidebar (Low/Med/High indicator)（根据每个策略 notes 中首个明确 IV 条件标识 `IV LOW` / `IV MED` / `IV HIGH`；表示适用波动率环境，不是实时标的 IV Rank）
- ✅ Probability cone on payoff chart (shaded distribution band)（Payoff 图按策略腿加权 IV 和最长 DTE 画出 68% 对数正态终值价格区间；该蓝色区间是价格分布，不是 POP）
- ✅ Export payoff chart as PNG（`PayoffChart` 导出当前 canvas 为命名 PNG；`canvasExport` 单元测试覆盖 PNG mime、下载文件名和缺失 canvas）
- ✅ Mobile-responsive layout (stack panels vertically)（策略库在 ≤900px 将 sidebar / 主内容 / 参数面板垂直排列；≤560px 将图表、notes、Greeks 网格收为单列并避免标题与操作按钮溢出）
- ✅ Payoff chart: show multiple DTE snapshots (not just current + expiry)（自动生成 75% / 50% / 25% 剩余 DTE 曲线；跨期结构按每条 leg 的实际剩余时间定价）
- ✅ Add 10 more strategies (exotic, FX, index-specific)（策略库增至 88 个模板：Call/Put Ladder、比例日历、Calendar Condor、Double Diagonal Condor、FX Risk Reversal / Seagull、Index Iron Condor / Broken-Wing Butterfly；catalog 测试校验数量、ID 唯一和新增模板存在）
- ✅ 策略 notes 进一步标准化（所有 88 个策略的 `iv` / `dte` / `tp` / `sl` 均展示至少一个数字阈值；模板本身已有数字时保留原规则，缺失项补入统一的 IV Rank 30-60、30-60 DTE/45 DTE、50% 止盈和 50% 最大风险止损基准；单元测试逐策略校验）
