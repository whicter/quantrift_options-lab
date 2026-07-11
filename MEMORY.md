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
- **Collector**: Python，运行在 Mac Studio cron，目录 `collector/`
- **DB**: PostgreSQL on Railway（`iv_history`, `scanner_configs` 表）

## 关键文件
- `server/src/migrate.js` — 建表脚本，Railway 上跑一次
- `collector/auth.py` — Tastytrade 认证，`--login` 手动登录，自动续 remember-token
- `collector/collect.py` — 每日 4:30pm ET 采集 IV → PostgreSQL
- `frontend/src/data/mockAnalysis.js` — V2 mock data（9 symbols），待替换为真实 API

## Tastytrade API
- 账户: whicter.han@gmail.com
- remember-token 存于 Mac Studio `collector/.env`（首次需 `python auth.py --login`）
- `/market-metrics?symbols=X,Y` → iv_rank(0-1), implied-volatility-30-day(%), hv-30-day(%)

## 待完成（优先级排序）
1. Railway: PostgreSQL + Node.js 部署，跑 migrate.js
2. Mac Studio collector: 配 .env，auth.py --login，加 cron
3. Vercel: 部署 frontend/，注入 VITE_API_URL
4. 前端: mock data → 真实 API
5. V2 功能: GEX、期权链、Unusual OI、技术分析层
