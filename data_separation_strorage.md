# Quantrift 数据分层与存储规划

> 文件名按当前任务约定保留为 `data_separation_strorage.md`。

## 1. 目标

为 Options Lab 与 Stock 整合后的数据建立明确边界：

- 哪些数据必须放云端；
- 哪些数据只需要短期云端保留；
- 哪些数据可以只放本地；
- 哪些数据不可重建，必须长期保存；
- 当前和扩容后的 PostgreSQL 容量需求；
- 如何避免高频快照再次填满数据库。

本规划服务于 [consoliation_task.md](./consoliation_task.md)。整合任务新增任何数据表、采集频率或历史留存前，都必须先确认符合本文档。

## 2. 核心原则

### 2.1 云端只保存产品当前需要的 Hot Data

必须放云端的数据满足至少一个条件：

- 网页/API 当前请求会读取；
- Stock 实时预警需要；
- 用户、订阅、持仓或提醒需要；
- 数据发生后无法重新构建；
- 需要跨机器协调 freshness、队列或幂等状态。

### 2.2 本地保存研究和回放使用的 Cold Data

可以放本地的数据通常具有以下特征：

- 只用于回测、参数搜索或调试；
- 不参与实时页面和 Telegram 决策；
- 数据可从 provider 重建；
- 单条价值低、数量巨大；
- 适合按 symbol/date/timeframe 分区。

### 2.3 公共请求不得同步依赖本地数据

- Mac Studio、NAS 或外置硬盘离线时，网页必须继续读取云端已有快照；
- Stock 若运行在本地，可以使用本地历史数据，但 Options Context 必须有云端快照或本地缓存降级；
- 本地归档不能成为 API request path 的必要依赖；
- 云端没有数据时返回 missing/stale，不去本地机器同步抓取。

### 2.4 不可重建的数据优先保护

空间小但不可重建的数据比大型可重建快照更重要。以下数据必须优先长期保存和备份：

- Stock 真实信号事件；
- 信号发生时看到的 Options Context；
- Candidate Ledger；
- 用户、订阅和提醒状态；
- News/Flow 等没有可靠历史回填的数据；
- 数据禁用原因、人工状态和版本记录。

## 3. 当前容量基准

Options Lab 在约 303 个标的、Option Chain 保留 7 天、Scanner 保留 3 天时，曾实际达到约 4.2GB：

| 数据 | 实际空间 |
|---|---:|
| `option_contract_snapshots` | 1.98GB |
| `option_oi_delta_snapshots` | 0.92GB |
| `scanner_results_snapshots` | 0.90GB |
| `scanner_candidate_snapshots` | 0.16GB |
| 其他数据 | 约0.25GB |
| 合计 | 约4.2GB |

当时 5GB Railway Volume 被填满。恢复后 Volume 扩大到 50GB。结论：

- 主要容量压力来自高频 Option Contract、OI Delta 和 Scanner 快照；
- 日线、Stock 信号和用户数据不是主要压力；
- 5GB/10GB 没有足够维护余量；
- 50GB 适合作为当前规模的安全上限，但实际使用应长期控制在 10GB 左右。

## 4. 数据分层

### 4.1 云端永久保存

| 数据 | 原因 | 预计规模 |
|---|---|---:|
| Stock Signal Event | 真实预警不可回到过去重建 | 0.1–0.3GB/年 |
| Signal-time Options Context | 联合回放必须使用当时信息 | 0.2–1.2GB/年 |
| Candidate Ledger | 记录模型当时推荐及最终结果 | 较小 |
| IV/HV/IV Rank 历史 | 产品分析和 IV Rank 需要连续历史 | 较小到中等 |
| 日线价格 | 页面、趋势和结果解析使用 | 较小 |
| 用户、订阅、持仓、提醒规则 | 产品状态 | 较小 |
| Symbol Universe 状态 | 包含人工禁用和注册状态 | 较小 |
| 不可回填新闻/Flow事件 | 发生后可能无法重取 | 视数据源而定 |

永久表必须有：

- 明确主键和幂等键；
- `created_at`/`as_of`；
- 数据或算法版本；
- 定期逻辑备份；
- 恢复验证，而不是只检查备份命令退出码。

### 4.2 云端短期保存

| 数据 | 默认保留 | 原因 |
|---|---:|---|
| 完整 Option Chain | 7天 | Weekly/OI/GEX 近期计算足够 |
| Option Contract Rows | 随 Chain 7天级联删除 | 最大空间来源 |
| GEX by Strike | 随 Chain 7天级联删除 | 可由近期Chain重建 |
| OI Delta | 随 Chain 7天级联删除 | 产品只读取近期变化 |
| Scanner Results | 3天 | 页面只读取最新批次 |
| Scanner Candidate Snapshots | 只保留有限批次 | 只需要最新可用批次 |
| 30分钟价格 | 35–90天热数据 | 页面和近期技术位使用 |
| Provider Job/Health状态 | 30–90天或状态化归档 | 运维排错，不是长期研究数据 |

清理要求：

- 每小时或每天运行有界 prune；
- 删除必须分批提交；
- 清理失败要告警；
- 高水位不得依赖人工发现；
- 删除大量数据后检查 autovacuum/ANALYZE；
- 不根据平均 bytes/row 猜 dead tuple，必须读取实际统计。

### 4.3 本地长期保存

| 数据 | 建议格式 | 用途 |
|---|---|---|
| 三年以上日线 | Parquet | 长周期回测 |
| 35/90天以前的30分钟线 | Parquet | 技术位和回放 |
| 完整1小时历史 | Parquet | Stock 1h/4h策略 |
| 4小时历史 | 默认不单独保存 | 从1h或30m派生 |
| ETF Scanner历史原料 | Parquet | 离线研究 |
| Backtest交易明细 | Parquet/JSON summary | 回测审计 |
| Walk-forward/参数搜索产物 | Parquet | 参数稳定性研究 |
| Shadow实验完整结果 | Parquet | 实验分析 |
| Provider原始payload | 压缩JSON/Parquet | 诊断和有限审计 |
| IB tick/debug数据 | 压缩文件 | 故障定位 |
| 旧日志、截图和报告 | 压缩归档 | 工程审计 |

### 4.4 可选本地归档

完整 Option Chain 超过云端保留期后有三个选择：

1. 直接删除：没有明确研究计划时的默认选择；
2. 只保存每日收盘紧凑派生状态；
3. 将完整合约级快照导出为本地 Parquet。

不要因为“将来可能有用”就默认永久保存全部原始链。完整链归档必须先写明研究用途、保留期限和预计增长。

## 5. 云端必须保留的数据

### 最新市场事实

- 最新日线和近期30分钟价格；
- 最新 IV/HV/IV Rank；
- 最新 Option Chain；
- 最新 GEX、Gamma Flip、Gamma Regime；
- 最新 Call/Put GEX Wall；
- 最新最大 Call/Put OI Wall；
- 最新 OI Delta；
- 最新市场状态、宽度和板块轮动；
- 每个产品的 freshness 和数据时间。

### 产品状态

- 用户、订阅和 entitlement；
- 持仓和多腿信息；
- Alert subscriptions 和发送幂等；
- Provider fetch job 当前状态；
- Collector heartbeat；
- Symbol active/disabled 状态。

### 不可重建事实

- Stock 真实信号；
- Signal-time Context；
- Candidate Ledger；
- 已发送提醒记录；
- 不可回填的数据流事件。

## 6. 不需要实时或不需要上云的数据

### 长历史行情

以下不参与当前页面或预警时，可只放本地：

- 3年以上日线；
- 35/90天以前的30分钟线；
- 完整1小时历史；
- 全量回测专用数据；
- 4小时派生结果。

### 原始 Provider 数据

- 原始 API JSON；
- 原始 WebSocket 消息；
- IB tick diagnostic；
- 合约发现列表；
- 已知重复错误响应；
- 采集器 debug dump。

### 研究产物

- 参数网格的所有组合；
- 每笔历史模拟交易；
- Notebook缓存；
- HTML图表；
- 截图；
- 临时数据库；
- 未通过门禁的实验中间数据。

云端只需保存最终验证摘要和对应版本，不保存所有中间产物。

### 全市场广度原始数据

云端保存每天聚合结果即可：

- advances/declines；
- advancing/declining volume；
- coverage；
- exchange breakdown；
- source和collected_at。

几千只股票的原始 grouped-daily constituent rows 可以本地短期保留或直接删除。

## 7. 本地文件组织

推荐：

```text
quantrift-data/
  prices/
    timeframe=1h/
      symbol=AAPL/
        year=2025.parquet
    timeframe=30m/
      symbol=AAPL/
        year=2025.parquet
  options/
    trade_date=2026-07-31/
      symbol=AAPL.parquet
  signals/
    year=2026/
      month=07.parquet
  backtests/
    strategy=rsi2/
      version=v2/
  provider_raw/
    provider=polygon/
      date=2026-07-31/
  reports/
  manifests/
```

要求：

- 优先 Parquet，不继续扩大 CSV 作为主要历史格式；
- 按 timeframe/symbol/year 或 date/symbol 分区；
- 每次导出生成 manifest；
- manifest 包含行数、时间范围、字段版本和校验值；
- 写临时文件后原子 rename；
- 导出完成并验证后，云端保留策略才能正常清理；
- 本地归档不得包含明文凭据。

## 8. 容量预测

### 当前约300标的

| 部分 | 预计空间 |
|---|---:|
| 当前 Options Lab 稳态 | 4–5GB |
| 三年股票底层行情 | 1.2–3GB |
| Stock信号与结果 | 0.1–0.3GB/年 |
| Signal-time Options Context | 0.2–1.2GB/年 |
| 用户、队列和索引增长 | 0.5–1GB |
| 第一年预计实际使用 | 6–10GB |
| 三年预计实际使用 | 10–18GB |

推荐配置：

- PostgreSQL Volume：50GB；
- 正常目标：实际使用低于25–30GB；
- 容量告警：70%和85%；
- 不建议降到5GB或10GB；
- 50GB是安全上限，不是允许无约束增长的预算。

### 扩大 Universe

| 规模 | 预计实际使用 | 推荐Volume |
|---|---:|---:|
| 约300标的 | 6–10GB | 50GB |
| 500标的 | 10–18GB | 50GB |
| 1,000标的 | 20–35GB | 100GB |
| 3,000标的，股票行情+选择性期权 | 50–100GB | 200GB |
| 3,000标的，全量高频期权链 | 100GB以上 | 不建议此设计 |

## 9. Signal Context 增长控制

推荐只在以下时点长期保存 Context：

- Stock 真正产生 live signal；
- Shadow实验明确需要；
- 每日收盘的有限对照样本；
- 经批准的历史验证采样。

禁止默认执行：

- 每5分钟为全部 universe 永久保存 Context；
- 每次页面访问都新增相同快照；
- Context 内嵌完整期权链；
- 同一个 signal 重复写多个相同版本；
- 缺失历史数据时用未来快照回填。

约296个标的每5分钟永久保存一次，理论上每年约580万份 Context。按 JSONB 和索引计算，可能增加50–100GB/年，因此明确禁止。

## 10. 本地容量建议

### 不保存完整长期 Option Chain

- 100–250GB 本地磁盘足够；
- 可保存多年1h/30m历史、回测、报告和诊断样本；
- 保持至少20%空闲空间。

### 保存完整长期 Option Chain

当前规模下，PostgreSQL形式的原始期权数据约增长12GB/月。转换成按日分区的Parquet后，预计约3–8GB/月，具体取决于字段和压缩率。

建议：

- 1TB SSD作为起点；
- 设置月度容量报告；
- 按研究需要设置6个月、1年或2年保留期；
- 不保存无用 raw payload 和重复合约字段；
- 冷归档仍需要第二份备份。

## 11. 备份策略

### 云端永久事实备份

每天备份以下小而重要的表：

- Stock Signal Event；
- Signal-time Context；
- Candidate Ledger；
- volatility/IV history；
- daily price history；
- users/subscriptions/positions；
- symbol universe；
- news/flow不可重建事实。

建议：

- 每日压缩逻辑备份；
- 保留14–30天；
- 每周复制到独立存储；
- 定期做恢复演练；
- 备份成功必须核对表、字段和行数。

### 不备份或低优先级备份

- 完整短期期权链；
- OI Delta派生快照；
- Scanner物化快照；
- Candidate物化批次；
- 可重新生成的GEX by strike；
- Provider job历史噪声；
- 大量debug日志。

这些数据占主要空间，但数小时或数天后产品价值很低，并且可以重新物化。

## 12. 日志策略

Stock 当前本地 `logs` 空间明显大于真实信号账本，因此必须配置：

- 普通运行日志保留14–30天；
- 单文件限制50–100MB；
- 最多保留5–10个轮转文件；
- error摘要长期保留，重复stack trace不长期保留；
- 信号账本和普通运行日志分开；
- PM2/stdout日志纳入轮转；
- 日志不能包含token、连接串或账号信息。

## 13. 监控与告警

至少监控：

- Volume使用率；
- 每张大表总大小；
- 每日新增行数；
- 最老/最新快照时间；
- prune删除数量和失败状态；
- dead tuple比例；
- autovacuum和ANALYZE状态；
- 本地归档剩余空间；
- 备份大小突然变为0或异常变大；
- Context写入量与真实信号数量是否匹配。

容量告警：

- 70%：调查增长来源；
- 85%：停止非关键历史写入并处理；
- 90%：只保留产品关键写入；
- 不允许再次等到100%才处理。

## 14. 数据生命周期决策表

新增数据前必须回答：

1. 页面或预警是否实时读取？
2. 数据是否能从provider重建？
3. 是否必须支持point-in-time replay？
4. 保存原始行还是紧凑派生结果？
5. 每个symbol每天产生多少行？
6. 一年预计多少行、多少GB？
7. 保留期是什么？
8. 谁负责prune？
9. 谁监控增长？
10. 备份和恢复要求是什么？

任何一项没有答案，不应直接加入长期云端表。

## 15. 最终建议

### 云端长期

- Stock Signal Event；
- Signal-time Options Context；
- Candidate Ledger；
- IV历史和日线；
- 用户和产品状态。

### 云端短期

- 完整Option Chain 7天；
- Scanner快照3天；
- OI Delta 7天；
- 30分钟价格35–90天。

### 本地长期

- 三年及以上1h/30m行情；
- 回测和参数研究；
- 可选的历史Option Chain Parquet；
- Provider raw payload；
- Debug日志和研究产物。

在当前约300个标的下：

- 云端实际使用目标：6–10GB；
- PostgreSQL安全上限：50GB；
- 普通本地研究存储：100–250GB；
- 长期完整Option Chain归档：建议1TB SSD；
- 公共产品路径永远不依赖本地冷归档。
