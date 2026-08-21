# 流水线吞吐诊断：配置写了但从未生效

日期：2026-08-20 / 21
触发：「我们现在的 data pipeline 是不是跑的都很慢」

## 结论

慢的不是代码，是**一行从未在生产生效的配置**。

```
option_chain_snapshot   p50 1297s (21.6 分) / p95 2433s (40 分)   747 个/48h
option_quote_snapshot   p50   41s /  p95   64s                    289 个/48h
```

IB 报价那条（2026-08-15 批量化过）健康。Polygon 取链慢了一个数量级。

## 根因

```
ecosystem.config.cjs:122   POLYGON_OPTIONS_REQUEST_DELAY: '1.5'
PM2 实际注册                (未注册)  → 回落到 POLYGON_STOCK_REQUEST_DELAY=16
```

`pm2 restart` 从 PM2 **保存的** app 定义重启，不读 ecosystem 文件。
所以每个期权链请求按 16s 而不是 1.5s 间隔发出，约 11 倍。

实测每条链的请求数（生产参数，隔离计时）：

| 标的 | HTTP 请求 | 纯网络 |
|---|---|---|
| SPY | 40 | 10.0s |
| AAPL | 16 | 2.7s |
| PLTR | 13 | 1.8s |

SPY 40 × 16s = 640s 单 worker，3 个 worker 争用同一限速行 → 正好落在
1297s 中位 / 2433s p95。

**这意味着 2026-08-15 提交并报告的「601s → 44.1s」提速，在生产一次都没生效过。**
代码对、配置对、提交了，但 PM2 一直在跑旧 env。

## 容量账（这才是「慢」的实感来源）

每天约 370 个链任务：

| | 修复前 | 修复后 |
|---|---|---|
| 每任务中位 | 1297s | ~154s |
| 所需墙钟（并发 3） | **44.4 小时/天** | **5.3 小时/天** |
| 相对 24 小时 | 超订 1.85 倍 | 占用 22% |

超订 1.85 倍意味着队列**在数学上永远不可能排空**——
这就是「为什么它不会自己追上来」的答案。

## 第二个 bug：僵死任务永不终结，把标的永久冻结

`recover_stale_running_jobs` 的重新入队分支带 `AND attempts < WORKER_MAX_ATTEMPTS`。
一个**既超时又耗尽重试**的任务两边都不匹配，于是永远停在 `running`。
而「活跃任务无论多旧都去重」，所以也永远不会有替代任务入队。

实测发现两个：

```
SMH  running 17.2 天   attempts=3   last_error=NULL
PEP  running 14.2 天   attempts=3   last_error=NULL
```

两者的期权快照最后写于 8/2 和 8/6，7 天保留期过后被清空，此后完全没有数据。
`last_error` 是 NULL——行上没有任何东西说明它为什么跑了两周。

**修复**：超时且耗尽重试的任务终结为 `failed` 并写明原因。
失败才是释放去重锁的动作，也是诚实的状态（三次尝试都没跑完）。

**验证**：重启后 PEP 的僵死行变 `failed`，卡死超 2 小时的任务归零；
约 7 分钟后调度器把 SMH 和 PEP 以 `attempts=0` 重新入队。

## 防复发

新增 `collector/check_pm2_env_drift.cjs`：比对 ecosystem 声明的 env 与 PM2
实际注册的 env，有漂移则退出码 1。只检查 `quantrift*`，本机另外约 19 个
PM2 app 属于其他仓库。

这个坑至今已用三种方式收过费：日志路径、广度的
`POLYGON_REFERENCE_REQUEST_DELAY`、以及这次的
`POLYGON_OPTIONS_REQUEST_DELAY`。**与运行进程不一致的配置文件不是配置，是愿望。**

```bash
node collector/check_pm2_env_drift.cjs
```

修复漂移**必须**用 delete + start，`pm2 restart` 不行：

```bash
pm2 delete <name> && pm2 start ecosystem.config.cjs --only <name> && pm2 save
```

## 顺带记录

广度两年回填已完成：341 个候选，写入 320，失败 0，耗时 5.3 小时——
其中 **112 次 429**，每次罚 60s，约占墙钟 35%。
grouped daily 在 16s 间隔下持续负载仍会被拒，这个端点的真实上限比
短时探测得出的「约 5 req/min」更低，值得单独测。
