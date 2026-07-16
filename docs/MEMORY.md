# quantrift_options-lab — Claude Memory

## Session
- **Session UUID**: `c8b5de84-d234-48bd-97b1-ae873526ac94`
- **Resume**: `cd ~/Documents/quantrift_options-lab && cr`
- `cr()` in ~/.zshrc: `claude --resume $(cat .claude_session)`

## 路径
- **本机**: `/Users/cohan/Documents/quantrift_options-lab`
- **Mac Studio**: `/Users/congrenhan/Documents/quantrift_options-lab`
- **GitHub**: `https://github.com/whicter/quantrift_options-lab`

## Git 同步规则
- 本机只能 `git pull`，不能 push（公司网络封锁 SSH）
- Mac Studio 负责所有 `git push`
- **本机 → GitHub**:
  ```bash
  git add -A && git commit -m "描述"
  rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' \
    /Users/cohan/Documents/quantrift_options-lab/ \
    mac-studio:/Users/congrenhan/Documents/quantrift_options-lab/
  ssh mac-studio "cd /Users/congrenhan/Documents/quantrift_options-lab && \
    git add -A && git commit -m '描述' && git push"
  ```
- **Mac Studio → 本机**: 先 ssh 查看改动 → Mac Studio push → rsync 指定文件拉回

## 规则
- **Bash 直接跑**，不问确认（.claude/settings.json 已配 `Bash(*)`）
- **参数改动必须先问用户确认**，不能自己决定
- **不能输出模棱两可的猜测**，只说能从代码/日志中证明的事实

## 技术栈
- **Frontend**: React 19 + Vite，部署 Vercel，根目录 `frontend/`
- **Backend**: Node.js Express，部署 Railway，根目录 `server/`
- **Collector**: Python，PM2 直接运行 Mac Studio 当前仓库的 `collector/`，不复制 runtime
- **DB**: PostgreSQL on Railway（核心表：`iv_history`, `price_history`, `option_chain_snapshots`, `option_contract_snapshots`, `gex_snapshots`, `gex_by_strike_snapshots`, `scanner_results_snapshots`, `provider_fetch_jobs`, `provider_request_usage`）

## 当前架构状态
- `docs/ARCHITECTURE.md` 是架构主文档。
- Phase 3C 已完成：snapshot cache、freshness contract、scanner materialization、refresh queue、worker、provider budget、cache monitoring。
- `/api/scan` 只读 `scanner_results_snapshots`，不在用户请求时全 watchlist 重算。
- `collector/materialize_scan.py` 生成 scanner cache。
- `collector/materialize_oi_delta.py` 生成 OI delta / unusual activity cache。
- `collector/run_refresh_worker.py` 消费 `provider_fetch_jobs`。
- `/api/status/cache` 查看 backlog / failures / scanner stale / empty snapshots / provider budget。
- PM2 app `quantrift-options-collector` 每 300 秒 bounded enqueue 最多 2 个 missing/stale option symbols、每 60 秒处理 queue、每 300 秒 materialize scanner；`quantrift-options-prices` 工作日 13:35 PT 跑 OHLCV。
- IB option discovery 先按 expiry/right 调用 `reqContractDetails`，只保存 IB 实际返回且具有有效 `conId` 的合约；禁止 expiry × strike × right 笛卡尔积。
- `IB_MARKET_DATA_TYPE=3` 接受延迟行情。stale/partial GEX 只要包含必要字段就显示并标注质量，不再整块隐藏。
- Analyze 已有真实技术评分与策略矩阵；当前推荐腿是 target fallback，不是完整 live-chain optimal leg selection。
- Production option collection uses `polygon_licensed`; `ib_internal` / `tt_internal` remain fallback/research adapters. API 与前端只读取 PostgreSQL snapshot。
- Provider credentials只允许存在于 `collector/.env` 或部署 secret store，不得写入 PM2 config、文档、测试或 Git。

## 关键文件
- `server/src/migrate.js` — 建表脚本，Railway 上跑一次
- `server/src/routes/scan.js` — scanner cache API，只读 `scanner_results_snapshots`
- `server/src/routes/status.js` — `/api/status/data`, `/api/status/options`, `/api/status/cache`
- `collector/auth.py` — Tastytrade 认证，`--login` 手动登录，自动续 remember-token
- `collector/collect.py` — 每日 4:30pm ET 采集 IV → PostgreSQL
- `collector/collect_options.py` — bounded option-chain snapshots
- `collector/compute_gex.py` — GEX / Wall / Gamma Flip compute
- `collector/materialize_scan.py` — scanner cache materializer
- `collector/materialize_oi_delta.py` — OI delta / unusual activity materializer
- `collector/run_refresh_worker.py` — refresh queue worker

## Tastytrade API
- 账户: whicter.han@gmail.com
- remember-token 存于 Mac Studio `collector/.env`（首次需 `python auth.py --login`）
- `/market-metrics?symbols=X,Y` → iv_rank(0-1), implied-volatility-30-day(%), hv-30-day(%)

## 待完成（优先级排序）
1. Polygon price history + derived HV/ATM IV/IV Rank readiness
2. Scanner/Analyze/universe product completion
3. Production auth/subscription/paywall

Collector health alert 已完成：`check_collector_health.py` 每 300 秒检查 coverage/failures/age/completeness，`collector_health_alerts` 持久化 fingerprint/cooldown/resolution，通知支持 webhook/SMTP/log fallback。
