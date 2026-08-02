# Quantrift Options Lab 与 Stock 整合任务

> 文件名按当前任务约定保留为 `consoliation_task.md`。

## 1. 目标

将 `quantrift_options-lab` 与 `quantrift_stock` 整合成一个 Quantrift 股票与期权产品：

- 一个共享市场数据底座；
- Options Lab 继续负责价格、IV、GEX、OI、市场状态、技术位和期权候选；
- Stock 继续负责股票策略、信号判断、Telegram 预警、复盘和虚拟组合；
- Stock 预警可以使用 Options Lab 的期权结构和技术位，给出更有依据的入场区、止损和目标位；
- 两套引擎保持独立运行，任何一侧故障都不能拖垮另一侧。

数据冷热分层、云端/本地边界、容量预测和保留策略以 [data_separation_strorage.md](./data_separation_strorage.md) 为准。本任务新增任何表、快照、备份或采集频率前，都必须先核对该文档。

## 2. 当前项目定位

### Options Lab

当前职责：

- React/Vite 产品前端；
- Node.js API；
- PostgreSQL 共享数据存储；
- Python 采集与物化任务；
- 日线和 30 分钟价格；
- IV Rank、IV/HV、期限结构；
- Option Chain、GEX、Gamma Flip、Call/Put Wall；
- OI Delta、异常活动、Scanner、市场状态和板块轮动；
- `/api/technical-levels/:symbol` 技术位聚合。

Options Lab 应成为整合后的共享市场事实层，但不能接管 Stock 的策略判断。

### Stock

当前职责：

- 1h、4h、1d 股票扫描；
- Confluence、RSI2、Breakout 等策略；
- Market Regime、VIX、板块和选股排名辅助；
- Telegram 告警；
- 永久信号账本；
- 确定性信号复盘；
- Paper-only 虚拟组合。

Stock 继续拥有策略和预警语义。Options Lab 只提供事实，不直接决定 Stock 是否发出信号。

## 3. 整合原则

### 3.1 一个产品，不等于一个进程

推荐目标结构：

```text
apps/
  options-web/
services/
  market-api/
pipelines/
  market-data/
engines/
  stock-alerts/
packages/
  contracts/
```

物理 monorepo 是后续选项，不是第一阶段前置条件。第一阶段先稳定数据契约，再决定是否合并目录和 Git 历史。

### 3.2 共享契约，不共享内部策略代码

- Node.js 与 Python 通过 JSON Schema/OpenAPI/数据库字段契约共享语义；
- 不允许 Stock 直接 import Options Lab 内部候选或评分代码；
- 不允许 Options Lab API 直接调用 Stock 策略函数；
- 数据字段必须版本化，并携带 `as_of`、freshness 和来源快照时间；
- 公开接口只输出产品需要的结果，不暴露内部规则、权重、provider 原始错误和完整期权链。

### 3.3 Snapshot-first

- Web/API/Telegram 路径只读取已落库或已缓存快照；
- 用户请求不能同步等待 Polygon、IB、Tastytrade 或本地 Mac Studio；
- 数据缺失或过期时，返回明确状态；
- 不得使用 mock、默认 Wall 或伪造点位填空。

### 3.4 Stock 必须可独立降级

当 Options Context 缺失、过期或 API 不可用时：

- Stock 原始信号逻辑继续运行；
- 原始 ATR/UT 止损与目标位继续输出；
- Telegram 标注“期权上下文不可用”或“期权数据已过期”；
- 不因 Options 数据失败而丢失本来应该发送的 Stock 信号；
- 失败不能触发无限重试或阻塞每小时扫描。

## 4. 数据所有权

### Options Lab 拥有

- 日线、30 分钟价格事实；
- IV、HV、IV Rank、期限结构；
- Option Chain 短期快照；
- GEX、Gamma Flip、Gamma Regime；
- Call/Put GEX Wall；
- 最大 Call/Put OI Wall；
- OI Delta 和异常活动；
- 市场状态、市场宽度、板块轮动、财报和新闻事实；
- 技术位聚合结果；
- 每个产品的数据新鲜度和采集状态。

### Stock 拥有

- 策略和参数；
- 信号方向和质量；
- 原始 entry、TP1、TP2、SL；
- Telegram 发送和去重；
- 信号复盘规则；
- Paper Portfolio；
- Shadow 策略和实验结果；
- Stock Signal Event 的业务语义。

### 共享但必须版本化

- Stock Signal Event；
- Signal-time Options Context；
- 最终点位建议；
- 信号结果和 R multiple；
- 联合回放所需的算法版本和时间戳。

## 5. 建议数据模型

### 5.1 `stock_signal_events`

永久记录 Stock 真正产生过的信号。

```text
id
signal_id                 unique
symbol
timeframe
strategy
direction
bar_time
emitted_at
entry_price_original
tp1_original
tp2_original
sl_original
atr
quality_original
market_regime
sector_aligned
screener_rank
params_json
strategy_version
source                    live | shadow | backfill
created_at
```

规则：

- `signal_id` 必须幂等；
- live、shadow、backfill 必须明确区分；
- backfill 不得混入真实 Telegram 信号统计；
- 参数快照不可只存当前配置引用，必须保存信号发生时版本。

### 5.2 `stock_signal_context_snapshots`

永久记录信号发生时可以看到的 Options/Technical Context。

```text
id
signal_id                  unique FK
symbol
context_as_of
source_snapshot_cutoff
spot
atr14
gamma_flip
gamma_regime
call_gex_wall
put_gex_wall
call_oi_wall
put_oi_wall
iv30
hv30
iv_rank
earnings_date
support_zones_json
resistance_zones_json
market_state_json
freshness_json
context_version
created_at
```

规则：

- 只保存当时已存在的数据；
- 禁止使用信号发生后的快照补写历史上下文；
- `source_snapshot_cutoff` 不得晚于信号决策时点；
- 缺失字段保持 `null` 并记录 freshness，不得合成；
- 长期只保存紧凑结果，不保存完整 raw option chain。

### 5.3 `stock_level_recommendations`

保存原始点位与 Options 辅助点位的版本化结果。

```text
signal_id
model_version
entry_zone_low
entry_zone_high
structural_stop
risk_stop
target_1
target_2
invalidation_reason
evidence_json
created_at
```

第一阶段可以将其作为 Context 的可选 JSON 字段；进入正式多版本回放后再拆表。

## 6. Stock 点位增强规则

### 6.1 第一阶段：只增强展示

第一阶段不得改变原始 Stock 信号是否成立，只在 Telegram 和内部复盘中增加：

- 最近支撑/阻力区；
- Call/Put GEX Wall；
- 最大 Call/Put OI Wall；
- Gamma Flip 和 Gamma Regime；
- IV Rank、IV/HV；
- Options Context 时间和 freshness；
- 原始 ATR 点位与结构化点位并排显示。

### 6.2 做多参考框架

- 入场区：当前价格附近或下方最近的高强度支撑集群；
- 结构止损：支撑集群下方的失效位置；
- 风险止损：保留现有 ATR/UT 止损作为风险边界；
- TP1：上方最近阻力集群或 Call Wall；
- TP2：下一阻力区或更远的 OI/GEX Wall；
- Gamma Regime：只作为波动环境说明，不作为未经验证的硬过滤。

### 6.3 做空参考框架

- 入场区参考上方阻力集群；
- 结构止损位于阻力失效上方；
- TP1 参考最近下方支撑或 Put Wall；
- TP2 参考下一支撑区；
- 保留原始 ATR/UT 风险边界。

### 6.4 禁止误用

- Max Pain 不得直接作为目标价；
- OI Wall 不得冒充 GEX Wall；
- 公开 OI 不能确认 dealer 方向；
- Gamma Regime 不能未经回放直接增加或过滤信号；
- Confluence 分数不能解释为胜率；
- stale/partial 数据必须显示质量，不得伪装为实时数据。

## 7. API/消费契约

建议新增内部接口：

```text
GET /api/internal/stock-context/:symbol
```

响应至少包含：

```json
{
  "symbol": "AAPL",
  "status": "ready",
  "as_of": "...",
  "spot": 0,
  "options": {
    "gamma_flip": null,
    "gamma_regime": null,
    "call_gex_wall": null,
    "put_gex_wall": null,
    "call_oi_wall": null,
    "put_oi_wall": null
  },
  "volatility": {
    "iv30": null,
    "hv30": null,
    "iv_rank": null
  },
  "supports": [],
  "resistances": [],
  "freshness": {},
  "context_version": "stock-context-v1"
}
```

要求：

- 后端 allowlist 序列化；
- 不返回完整期权链；
- 不返回 provider 凭据、内部错误、完整评分公式和参数；
- 设置超时和本地缓存；
- Stock 每轮扫描最多批量读取一次，不能每个策略重复请求；
- 缓存键包含 symbol 和 context version；
- 缓存过期时 fail open 到原始 Stock 预警。

## 8. 历史行情边界

现有 Options Lab 默认：

- 日线最多 400 根；
- 30 分钟约 35 个自然日。

现有 Stock 需要：

- 1h/4h 约 60 天用于实时判断；
- 1d 约 3 年；
- 更长历史用于回测和 walk-forward。

因此第一阶段不能立即删除 Stock 的 yfinance/CSV 路径，也不能假设 Options Lab 当前价格库足以替代所有 Stock 回测数据。

执行方式：

- 实时/近期事实逐步迁到共享 PostgreSQL；
- 长周期历史按 [data_separation_strorage.md](./data_separation_strorage.md) 存本地 Parquet；
- 4h 从 1h 或 30m 派生，不重复永久保存；
- 数据切换必须做同一时间窗口的逐 bar 对比；
- auto-adjust、时区、盘前盘后和重采样边界必须一致。

## 9. 分阶段任务

### Phase 0：仓库保护与基线

- [ ] 记录两个仓库当前 branch、HEAD 和 working tree 状态；
- [ ] 保护 Stock 大量未提交/未跟踪改动；
- [ ] 不在 dirty Stock checkout 上直接合并 Git 历史；
- [ ] 从最新远端建立干净工作树做整合开发；
- [ ] 保存现有 Stock 信号格式、参数和 Telegram 输出基线；
- [ ] 保存 Options Lab 当前 API/schema 兼容基线。

退出条件：两个项目均有可回滚基线，用户现有改动不会被覆盖。

### Phase 1：共享契约

- [ ] 定义 `stock-context-v1` 字段和 freshness 规则；
- [ ] 定义 `stock_signal_events`；
- [ ] 定义 `stock_signal_context_snapshots`；
- [ ] 定义 signal/context 幂等键；
- [ ] 定义 live/shadow/backfill 边界；
- [ ] 定义数据库迁移和回滚方式；
- [ ] 给 contract 编写固定 fixture 测试。

退出条件：Node 与 Python 对相同 fixture 产生一致字段和时间语义。

### Phase 2：Context Provider

- [ ] 在 Options Lab 内构建只读 context assembler；
- [ ] 复用技术位、GEX、OI、IV、市场状态的现有已落库事实；
- [ ] 新增内部 API 或批量快照读取方式；
- [ ] 输出每个组件的独立 freshness；
- [ ] 增加超时、缓存和缺失状态；
- [ ] 禁止 request-time provider fetch；
- [ ] 禁止输出完整期权链和内部规则。

退出条件：有数据返回 ready，部分数据返回 partial，缺失返回 missing，且三种状态都不制造字段。

### Phase 3：Stock 只读接入

- [ ] Stock 每轮扫描批量读取 context；
- [ ] 写本地短期缓存；
- [ ] 在 Telegram 增加 Options/Technical Context；
- [ ] 保留原始 entry/TP/SL；
- [ ] 清楚显示数据时间；
- [ ] API 失败时继续发送原始信号；
- [ ] 将 signal event 和当时 context 以可审计方式写入长期账本。

退出条件：关闭集成开关后输出与当前 Stock 基线一致；开启后只增加上下文，不改变信号数量。

### Phase 4：Point-in-time Replay

- [ ] 从上线当天开始积累真实 signal-time context；
- [ ] 建立原始 ATR 点位与结构化点位对照；
- [ ] 严禁使用信号后的 Options 快照；
- [ ] 分 symbol、strategy、timeframe、direction 统计；
- [ ] 统计触达率、止损率、MFE、MAE、R multiple、持有时间；
- [ ] 对缺失/stale context 单独分组；
- [ ] 将交易成本和滑点纳入结果；
- [ ] 报告样本量和置信区间，不挑选单项好看指标。

建议最低门禁：

- 至少覆盖一个完整市场环境周期；
- 每个拟转正分组至少 50 个真实或严格 point-in-time 样本；
- 风险指标不得恶化；
- 目标位改善不能以显著扩大止损为代价；
- 同一算法版本可确定性重放。

退出条件：有书面验证报告，明确通过、失败和未验证分组。

### Phase 5：有限度改变点位

- [ ] 只对通过 Phase 4 的分组启用结构化点位；
- [ ] 保留原始 ATR 点位供审计和快速回滚；
- [ ] 使用 feature flag 按 strategy/symbol/timeframe 开启；
- [ ] 记录 model version；
- [ ] 监控信号频率、触达率和数据缺失率；
- [ ] 不自动执行订单。

退出条件：线上结果可追踪、可关闭、可回放，且没有扩大执行权限。

### Phase 6：物理项目整合

- [ ] 数据契约稳定后再评估 monorepo；
- [ ] 保留前端、API、collector、stock engine 独立部署；
- [ ] 统一 CI，但各服务可单独测试和回滚；
- [ ] 统一文档入口、schema contract 和 release version；
- [ ] 不将 Mac Studio 变成公共 API 的同步依赖。

退出条件：物理合仓不改变运行边界，任一服务可独立发布和回滚。

## 10. 存储约束

本任务所有实现必须遵循 [data_separation_strorage.md](./data_separation_strorage.md)，特别是：

- 完整 Option Chain 云端默认仅保留 7 天；
- Scanner 快照云端默认仅保留 3 天；
- 信号时点紧凑 Context 永久保存；
- 长周期 1h/30m 历史放本地 Parquet；
- 不得每 5 分钟给全 universe 永久保存一份完整 Context；
- 4h 数据从较小周期派生；
- 原始 provider payload、debug ticks 和回测中间产物不进入长期云端表；
- PostgreSQL 当前推荐保留 50GB 上限，并设置 70%/85% 容量告警；
- 云端公共请求不能读取本地冷归档。

## 11. 验证要求

### 数据正确性

- symbol、时区、bar close 时间一致；
- `as_of` 不晚于决策时点；
- stale/partial/missing 分开；
- OI Wall 与 GEX Wall 分开；
- Max Pain 不作为默认目标；
- 原始 Stock 点位可追溯；
- Context 版本可追溯。

### 可靠性

- Options API 断开时 Stock 仍扫描；
- PostgreSQL 只读失败有超时；
- 本地 Mac 离线不影响网页读取已缓存快照；
- 重复信号不重复写账本；
- Collector 失败不会写入假 ready 状态；
- 清理任务失败会告警，但不阻断主要采集。

### 安全和产品边界

- 内部 endpoint 有明确权限边界；
- 浏览器不接收原始期权链；
- 不暴露 provider 凭据、预算和原始错误；
- Stock 仍然只告警、不下单；
- 新集成不扩大 broker 权限。

## 12. 非目标

当前任务不包括：

- 自动下单；
- 用 Options 数据直接替换所有 Stock 策略；
- 未回放就修改信号触发门槛；
- 永久保留所有原始期权快照；
- 将 Max Pain 包装为预测目标；
- 将技术位强度解释为成功概率；
- 为了“一个项目”把所有服务合成一个进程；
- 让公共 API 同步依赖本地 Mac Studio。

## 13. 最终完成标准

1. Options Lab 成为共享市场事实层；
2. Stock 保持独立策略所有权；
3. Telegram 可以显示带真实时间戳的 Options 辅助点位；
4. Options Context 缺失不会阻断原始 Stock 信号；
5. 每个真实信号保存不可回看的 point-in-time context；
6. 任何点位逻辑变更均经过无 look-ahead replay；
7. 云端与本地数据边界符合 [data_separation_strorage.md](./data_separation_strorage.md)；
8. 数据容量在当前约 300 标的下长期保持在规划范围；
9. 所有变更可通过 feature flag 回滚；
10. 系统继续保持只预警、不自动下单。
