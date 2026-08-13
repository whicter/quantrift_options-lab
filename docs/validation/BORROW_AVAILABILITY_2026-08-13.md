# 借券可得性采集（2026-08-13）

## 为什么做这个

`squeeze_watch` 已有 `days_to_cover`（FINRA 经 Polygon，双周结算），但那是**空头有多少**，
不是**空头有多痛**。痛感来自借券成本，而 Polygon 不提供，Ortex / S3 按四位数年费出售
且需单独谈商用再分发。

在付费之前先验证免费路径。IB Gateway 本来就在跑。

## 实测：可得性拿得到，费率拿不到

`reqMktData` generic tick 236 的返回：

| tick | 含义 | 实测 |
| --- | --- | --- |
| 46 (generic) | Shortable 等级（>2.5 可借，1.5–2.5 难借，<1.5 不可借） | ✅ 3.0 |
| 89 (size) | ShortableShares 可借股数 | ✅ GME 6,134,175 / AAPL 86,673,328 |
| 47 | 借券费率 | ❌ **从未返回** |

IBKR 另有一份公开文件 `ftp3.interactivebrokers.com/usa.txt` 含 `FeeRate`，
但本机 **FTP 出站被网络阻断**（curl 与 ftplib 均超时）。
换网络（手机热点 / Railway）重试一次即可判定是否只是本地策略问题——**这是拿到费率最便宜的一条路，尚未排除**。

## 为什么可得性可以顶替费率

两者是同一稀缺性的两个面：可借池塌陷时费率飙升。**信号在趋势而非水平**——
GME 今天 613 万股可借这个数字本身没有意义，三天后掉到 50 万才有意义。
所以这是日频表，不是按需查询；也因此必须现在开始积累。

## 落地

- `providers/ib_borrow_provider.py`：独立 client id **44**（42 期权链 / 12 价格 / 55 新闻 /
  96 属本机另一项目）。两个 tick 齐了立即释放等待，不等满超时——串行通道上这决定总耗时。
- `collect_borrow_availability.py`：按近 7 日 `call_oi_above` 排序取标的，
  截断时先丢最不相关的尾部。
- `borrow_availability_history`：持久表，`status` 区分 `ok` / `not_shortable` /
  `no_data` / `error`——**IB 拒绝出借是一个真实观测，不是空值**，它是同一量表的极端。
- PM2 `quantrift-borrow-availability`，工作日 14:00 PT。已加入 `backup_facts.TABLES`：
  IB 只发布当日数值、没有历史，丢一行就是这张表赖以存在的趋势上的永久缺口。

## 首次运行

```
198 个标的，2 分 34 秒
ok 194 / no_data 3 / error 1
```

数据自洽性检查——可借股数最少的一端与独立来源的回补天数互相印证：

| 标的 | 可借股数 | 回补天数（FINRA） |
| --- | --- | --- |
| BSP | 2,970 | 7.5 |
| SLS | 24,871 | 7.9 |

两个数据源独立采集，指向同一批标的。

## 一个自伤，值得记

首次全量运行 **12/12 全部返回 `error`，而数值其实已经在手**。

根因：IB 错误码 **2176** 是警告——
`Warning: Your API version does not support fractional share size rules. Trimmed value 5349354.640999 to 5349354`——
但我按白名单枚举"无害码"，2176 不在名单里，于是被当成致命错误，且 `error()` 会立即
set event 中断等待，把已到达的 tick 一并丢弃。

两处修正：

1. **按区间判定**：IB 保留 2100–2199 为警告与系统通知。逐个枚举正是"好数据被陌生码丢掉"的机制。
2. **有数据优先于有错误**：IB 可以对同一请求同时发出通知和可用 tick，
   因为收到消息就丢弃 tick 会损失真实观测。

那条 `by_status` 全 `error` 时的告警日志起了作用——它让"安静的失败"变成了显式警告。

另：该测试文件初版跑 20 秒（无数据用例各等满 4 秒真实超时），已在 setUp 中将
`per_symbol_timeout` 降至 0.01，降到 0.07 秒。

## 验证

- collector **401/401**（新增 `tests/test_borrow_availability.py` 10 项）
- 迁移以只建新表方式应用（7 列），沿用 `lock_timeout` 做法
- `migrate.js` 一度语法报错：我在 SQL 注释里写了反引号包裹的字段名，
  **反引号会提前终止 JS 模板字符串**。注释里不要用反引号。

## 边界与未完成

- **不进产品**：IB 数据在本仓库是 `ib_internal`，内部/过渡来源。
  要出现在 `/positioning` 上需先过与 IB 报价同一道授权检查。
- **仍缺**：借券费率（IBKR FTP 待换网络重试）、利用率（需可借池总量，Ortex/S3）、
  真实流通股（Polygon 只有已发行股本）。
- **今天是第 1 天**：趋势需要时间。在有足够序列之前，可借股数只能作为静态描述，
  不能作为"借券正在收紧"的判断。
