# 广度序列回填核对报告

日期：2026-08-15
工具：`collector/verify_market_breadth.py`
状态：**已存数据质量合格，序列本身不完整，回填运行中**

## 结论摘要

```
status: failed          ← 失败原因只有「不完整」，不是「数据错」
sessions: 180           范围 2024-08-16 ~ 2026-08-14
coverage_min:    98.4   coverage_median: 99.1   counted_min: 5064
quality_failures:   []  ← 无
arithmetic_failures: [] ← 无
chain_breaks: 1
missing_weekdays: 341   （2024=97, 2025=237, 2026=7）
```

**已经写进去的每一行都是干净的**：覆盖率最低 98.4%、中位 99.1%（门槛 90），
最少计入 5,064 个标的，零质量失败、零算术失败（`advances + declines` 与
`counted` 自洽）。问题纯粹是**序列有洞**，不是值有错。

## 缺口形态

`chain_breaks` 只有一条，但它说明了全部问题：

```
2025-11-26: previous_market_date=2025-11-25，但库里前一个会话是 2024-08-16
```

也就是说库里实际是「2024-08-16 一个孤点」+「2025-11-26 起的连续块」。
grouped daily 是**滚动两年窗口**，两年约 500 个交易日，我们只有 180。

## 回填进度与两个必须记住的坑

回填脚本按缺口列表逐日补，且对已存日期幂等。当前在跑（2026-08-15 21:5x 启动），
预计约 7 小时完成 341 个候选。

### 坑一：后台脚本不继承 PM2 的 env

第一次启动用 `nohup env PYTHONPATH=$PWD ...`，只带了 PYTHONPATH。
`POLYGON_REFERENCE_REQUEST_DELAY=3` 只写在 `ecosystem.config.cjs` 的
`quantrift-market-breadth` 里，**独立脚本拿不到**，于是 reference 回落到
`POLYGON_STOCK_REQUEST_DELAY` 的默认 16s：每个会话 7 个 reference 请求
＝112s，实测每会话约 190s。显式带上 env 后降到约 72s。

> 一次性/旁路脚本不共享 PM2 的 env，也不共享主采集器的限速配置——
> 与 `backfill_iv_history.py` 是「bypass path」是同一类问题，
> 新写的任何直连 provider 的脚本都要显式确认自己的 pacing。

### 坑二：16s 间隔的 grouped daily 在持续负载下仍会 429

无并发写入者的情况下，21:52 之后 6 分钟内仍出现 2 次
`provider polygon/breadth penalized for 60.0s after 429`。
之前用短时探测得出的「grouped daily 约 5 req/min」在**持续**负载下偏乐观。

限速器的行为是对的：`penalize()` 让所有 worker 一起退避，60s 自清，
所以回填不会失败，只是变慢——每次 429 的 60s 惩罚约占墙钟的三分之一。
**这是「短时突发探测不等于限速探测」的又一个实例**，与
`probe_rate.py` 文件头写的是同一条教训。

### 一个有界的浪费（已知，未改）

缺口列表按**工作日**生成，而工作日里包含假期。假期没有交易日数据，
采集器会 walk-back 到前一个交易日——那一天通常**已经在库里**，
于是花掉一整个约 72s 的周期去幂等重写一行已有数据。
2026 的 7 个「缺失工作日」全部是这种情况（7/3、6/19、2/16 等），
所以 sessions 只从 179 涨到 180 而实际写了 7 次。

2024–2025 的 334 个缺口是真实缺失，其中假期约 18 个，
浪费有界（约 5%），因此**不值得为此改代码**，但要知道
「写入次数」与「新增会话数」不是一回事，看进度时别把前者当后者。

## 复核方式

```bash
cd collector && PYTHONPATH=$PWD ./venv311/bin/python verify_market_breadth.py
```

完成后应看到 `sessions` 接近 500、`missing_weekdays` 仅剩假期、
`chain_breaks` 为空。**在此之前不要把这张表当成两年历史用**——
NYMO 之类的指标需要连续序列，180 个带洞的会话算出来的 EMA 是错的。
