# GEX 历史持久化（2026-08-09）

## 起因

评估一个交易方法（Fabio Valentini 的订单流 / ORB 体系）能否量化到个股时，实测确认逐笔成交与
NBBO 在现有 Polygon Options 档订阅下均为 403，因此订单流确认层无法复现。可迁移的部分只剩
"位置"层，而我们真正独有、且有机制解释的位置信号是做市商 Gamma 持仓（GEX）。

要验证任何 Gamma 假设都需要历史序列。检查发现 `gex_snapshots` 只有 7 天数据。

## 真因：级联删除，不是保留期参数

```
gex_snapshots.snapshot_id       BIGINT NOT NULL REFERENCES option_chain_snapshots(id) ON DELETE CASCADE
gex_by_strike_snapshots.snapshot_id  同上
```

`prune_snapshots.py` 按 `OPTION_CHAIN_RETENTION_DAYS=7` 删除 `option_chain_snapshots`，
级联把 GEX 一起带走。**不存在独立的 GEX 保留期开关**，所以调参数解决不了。

而这个 7 天保留期必须保留：它控制的是下面这两张表，占 2 GB 库的三分之二。

| 表 | 行数 | 体积 |
| --- | --- | --- |
| `option_contract_snapshots` | 302,189 | **818 MB** |
| `option_oi_delta_snapshots` | 274,715 | **492 MB** |
| `scanner_results_snapshots` | 144,607 | 411 MB |
| `gex_by_strike_snapshots` | 42,397 | 26 MB |
| `gex_snapshots` | 4,177 | 12 MB |

调大 `OPTION_CHAIN_RETENTION_DAYS` 会让前两张表按每周 1.3 GB 膨胀，正是
`docs/validation/DB_VOLUME_FULL_OUTAGE_2026-07-30.md` 记录的那次 5 GB 卷写满事故的成因。
**不要走这条路。**

## 设计：持久表与被清理表分离

沿用 `candidate_ledger`（持久）与 `scanner_candidate_snapshots`（被清理）已有的分层。
两张新表**不带外键**，因此不受级联影响：

- `gex_history` —— 保留**每一个盘中快照**，但只存标量。
- `gex_strike_history` —— 每个 `(symbol, market_date, strike)` 一行。

均为后端验证数据：不加产品路由、不加导航、不开放公开读取端点。

### 为什么标量表可以留全部盘中快照

实测 4,177 行的字段体积占比：

| 字段 | 体积 |
| --- | --- |
| `gamma_curve` (JSONB) | 5,165 kB |
| `raw_metrics` (JSONB) | 3,125 kB |
| **全部标量合计** | **269 kB** |

标量约 66 字节/行，两个 JSONB 占 97% 且可从链重新推导。按 ~650 快照/天 × 250 交易日估算，
**约 30 MB/年**，因此没有必要为省空间降到日频——降频只省 15 MB，却丢掉全部盘中分辨率。

### 为什么逐行权价表只留每日一份

关键实测（2026-08-07，AAPL 行权价 320）：

| 当天快照数 | 不同 `call_oi` | 不同 `put_oi` | 不同 `net_gex` |
| --- | --- | --- | --- |
| 20 | **2** | **2** | **20** |

TSLA 及其余行权价形态一致。**持仓（OI）是日频量**，盘中 `net_gex` 的变化只是同一份 OI 分布
在移动的现价下重算。因此盘中多存 20 份 ≈ 20 倍冗余、零新增信息；任何盘中 Gamma 剖面都能由
"当日 OI 分布 + 当时现价"（`price_history_30m` 已有）事后重建。

约 150 字节/行 × 约 2,400 行/天 × 250 天 ≈ **约 100 MB/年**。

合计约 130 MB/年，对 50 GB 卷（现用 2 GB）是 +0.26%/年，按 ~$0.15/GB·月约合 **$0.02/月**。

### 两个必带字段

- `model_version` —— `weekly.js` 已按它过滤。不记录则模型换代后新旧数据静默混入同一序列，
  与 `iv_source` 之于拼接 IV 序列是同一个教训。
- `market_date` —— 按 `America/New_York` 计算，与 `weekly.js`、`collect_prices.py`、
  `derive_volatility.py` 一致。用 UTC 会在盘中翻页，把一个交易时段劈成两天。

### 一个必须知道的语义

`gex_strike_history` 中某一天的行集是**当天出现过的行权价并集**，不是单一时刻切片：
10:00 报过、收盘前已不在链中的行权价会保留其 10:00 的值。每行自带 `snapshot_ts`，
需要一致时刻切片时按 `(symbol, market_date)` 取 `MAX(snapshot_ts)` 过滤。

## 写入时机

`persist_gex_history()` 在 `persist_gex()` 的**同一个事务内**、`conn.commit()` 之前调用。
若分开提交，两者之间崩溃会留下"有快照、无历史"的行，而该快照 7 天后即被删除，
缺口将永久且无声。已有回归测试锁定这一顺序。

## 本地序列化存储

按项目归拢到外置卷（另一并行改动已将 `DATA_ROOT` / `FACT_BACKUP_DIR` 指向该处）：

```
/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab/
  fact-backups/   backup_facts.py 输出（每日 02:15，保留 14 份）
  logs/           PM2 stdout/stderr
  research/       研究数据集
```

`gex_history` / `gex_strike_history` 已加入 `backup_facts.TABLES`：它们与 `candidate_ledger`
同属不可再生数据——记录的是"过去某一刻做市商持仓是什么"，其操作表 7 天后即消失，
届时已无从重算。

新增 `backup_facts.assert_backup_root_usable()`：外置卷未挂载时，macOS 会把
`/Volumes/X9_Pro/...` 当作启动盘上的普通目录创建，重新挂载后该目录被遮蔽，
表现为"备份成功但文件消失"。**一个谎称成功的备份比失败的备份更糟**，故直接拒绝写入。
守卫覆盖两种形态：路径不存在，以及路径存在但不是挂载点（残留 stub）。

## 验证

- collector 测试 **362/362 通过**（含新增 `tests/test_gex_history.py` 9 项）
- server 测试 **293/293 通过**
- 迁移：全量 `migrate.js` 首次运行遭遇 `deadlock detected`——它会触及整个 schema，
  而 collector 正在写快照、prune 正在删除。改为只执行两条新建表语句（纯新增、无外键、
  不 ALTER 任何既有表，并设 `lock_timeout=10s` 快速失败），成功建表（19 列 / 13 列）。
- 真实库写入冒烟：以 `2026-08-08 01:30 UTC`（纽约 08-07 21:30）写入，
  `market_date` 正确落为 `2026-08-07`，`model_version` 与 `spot` 均正确落库，测试行已清理。

## 顺带修复：外置卷上备份保留期从未生效

手动验证 `backup_facts.py` 写入外置盘时发现，`prune_old_runs` 每次都以
`FileNotFoundError` 中断，**`FACT_BACKUP_KEEP=14` 实际完全失效**——目录里累积了 17 份，
最早可追到 2026-07-30。

真因是 exFAT + macOS 的 AppleDouble sidecar：每个文件旁有一个 `._name`，
`iterdir()` 会把它列入待删列表，但删除 `name` 时系统已连带删除 `._name`，
轮到该条目时文件已不存在。异常发生在循环中，导致该次 `rmdir` 未执行。

修复为 `child.unlink(missing_ok=True)`。验证：清理后目录由 17 份收敛到 14 份，
已加回归测试（模拟 sidecar 连带消失的删除语义）。

## 部署顺序（重要）

新 `compute_gex` 会向 `gex_history` 写入。**迁移必须先于 collector 重启完成**，否则整个
`persist_gex` 事务会因表不存在而失败，导致全标的 GEX 计算中断。迁移已于本次应用完成，
因此后续 PM2 reload 是安全的。

## 尚未完成

- PM2 尚未 reload，运行中的进程仍是旧代码；下次重启才会开始写入历史。
- 历史从 reload 之后才开始累积，**过去的数据无法回补**（快照已被清理）。
  这是本次改动越早上线越好的唯一原因：时间是这里唯一买不到的输入。
