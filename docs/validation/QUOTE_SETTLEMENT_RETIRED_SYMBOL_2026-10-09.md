# 报价 settlement 路径排除退役标的 — 2026-10-09

## 现象

生产告警：

```text
覆盖 310/310 (100.0%)
24 小时内 option_quote_snapshot 失败 26 次，最近 1 小时 6 次
fingerprint 31947be3
```

只读查询 `provider_fetch_jobs` 得到 26/26 条相同结果：

```text
symbol: WBD
error: IB contract details empty for WBD
attempts: 3
request_params.reason: ledger_settlement
```

数据库状态同时显示：

```text
symbol_universe: WBD active=false, scan_enabled=false
quote_watchlist: WBD 仍存在
candidate_ledger: 存在 outcome IS NULL 的多到期日行
```

## 根因

`schedule_quote_refresh.run()` 先调用 `settlement_symbols()`。该路径为了保护当天到期的多
到期日候选，设计上绕过 watchlist、普通失败抑制和队列深度。它没有检查标的是否已经从
`symbol_universe` 退役，因此 WBD 每个 `*/10` cron 周期重新进入报价队列。

## 修复

`SETTLEMENT_SYMBOLS_SQL` 增加 `JOIN symbol_universe u ON u.symbol = s.symbol AND u.active = TRUE`。
这保留了“不在 quote_watchlist 但仍有效的 settlement 标的”能力，同时阻断已退役标的继续
驱动 IB 请求。台账行不删除，失败历史不做破坏性清理。

## 测试

- 新增 `test_settlement_query_excludes_retired_symbols`。
- 保留既有测试：settlement 不受 watchlist 限制、优先级高于后台 sweep、空 watchlist 不取消
  settlement、失败抑制按最后一次成功之后的连续失败计算。

## 生产验收

部署并 reload quote-refresh 后确认：

1. WBD 不再产生新的 `reason=ledger_settlement` job。
2. `option_quote_snapshot` 最近 1 小时失败数归零或回到真实故障数量。
3. 旧 26 条失败记录在滚动 24 小时窗口滑出后，告警自动 resolve。
4. 一个 active 且不在 quote watchlist、当天确有 settlement 的标的仍会被排队。
