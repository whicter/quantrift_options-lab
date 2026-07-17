# Quantrift Options Lab 部署说明

> 项目仓库：`whicter/quantrift_options-lab`  
> 生产分支：`master`  
> 正式站点：`https://www.quantrift.io`  
> 前端：Vercel  
> API：Railway  
> 数据库：Railway PostgreSQL  
> 数据采集器：Python collector（当前可由 Mac Studio 运行）

---

## 1. 文档目的

本文档描述 Quantrift Options Lab 当前生产环境的部署拓扑、环境变量、本地开发方式、上线流程、验证步骤、故障排查、安全要求和后续运维事项。

本文档区分两类内容：

- **当前已部署或已验证的配置**：可以作为现状使用。
- **建议配置或演进项**：需要在对应平台或代码中确认后实施，不能视为已经完成。

### 1.1 Analyze derived API deployment check（2026-07-15）

本次新增无需 migration 或新 secret。Railway 部署后验收：

```bash
curl -f "$API/api/sr/AAPL"
curl -f "$API/api/chain/stats/AAPL"
```

第一条应返回 `status=ready`、ISO `latest_date`、真实 `bar_count`、S/R 与 Focus readiness；第二条应返回 snapshot source/time、ISO expiry、term structure 和 skew。缺数据时必须返回 `missing`/空数组，不能返回 mock。回滚为回滚该 section commit 并重新部署 Railway/Vercel。

---

## 2. 当前生产拓扑

```text
用户浏览器
    |
    | HTTPS
    v
https://www.quantrift.io
    |
    | Cloudflare DNS
    v
Vercel
    |
    | 静态前端：React 19 + Vite
    | VITE_API_BASE_URL
    v
https://quantriftoptions-lab-production.up.railway.app
    |
    | Node.js + Express
    | DATABASE_URL
    v
Railway PostgreSQL
    |
    v
public.iv_history
    ^
    |
    | PostgreSQL 公网连接 + SSL
    |
Python collector
当前可运行于 Mac Studio
```

### 2.1 生产验收记录

#### 2026-07-16 — Real-data integrity repair

- Railway scanner had returned HTTP 500 because its final SQL joined `latest_rows` and `latest_community_batch` but left `source`, then `snapshot_ts`, unqualified. Both fields now explicitly read from `latest_rows`; freshness CASE expressions use the same owner.
- Vercel Analyze had retained `mockAnalysis` as a base object before overlaying API responses. The file and all production imports were removed; the page now starts with null fields and only real price/metrics/GEX responses populate it.
- Verification after deployment: Railway `GET /api/scan?minIvr=40&maxIvr=100&limit=5` returned HTTP 200 with real scanner rows. Vercel `GET /analyze?symbol=NFLX` rendered `$73.68`, `polygon_licensed` price/GEX, Call Wall `$75`, and Put Wall `$73`; `/scan` rendered 1,700 real quoted candidates.

最近一次验收：2026-07-14

已验证命令和结果：

```bash
curl -I https://quantrift.io
# HTTP/2 308
# location: https://www.quantrift.io/

curl -I https://www.quantrift.io
# HTTP/2 200

curl -f https://quantriftoptions-lab-production.up.railway.app/health
# {"status":"ok"}

curl -f "https://quantriftoptions-lab-production.up.railway.app/api/metrics?symbols=AAPL"
# {"AAPL":{"symbol":"AAPL","date":"2026-07-14T00:00:00.000Z",...,"source":"test"}}

curl -f "https://quantriftoptions-lab-production.up.railway.app/api/scan?minIvr=0&maxIvr=100&limit=5"
# [{"symbol":"AAPL","date":"2026-07-14T00:00:00.000Z",...,"source":"test"}]
```

说明：API 和数据库链路已验证；当前样例数据 `source` 为 `test`，不代表生产 collector 已持续采集真实市场数据。

项目的主要目录：

```text
quantrift_options-lab/
├── frontend/      # React 19 + Vite 单页应用
├── server/        # Node.js + Express API
├── collector/     # Python 数据采集与数据库写入
└── docs/          # 项目文档
```

---

## 3. 域名和 DNS

### 3.1 正式域名

正式主站：

```text
https://www.quantrift.io
```

根域名：

```text
https://quantrift.io
```

当前设计为根域名通过 HTTP 308 永久跳转到：

```text
https://www.quantrift.io
```

因此生产环境 CORS、Canonical URL、监控和验收均应以 `https://www.quantrift.io` 为主。

### 3.2 Cloudflare DNS

域名由 Cloudflare 管理。供 Vercel 使用的记录：

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `@` | Vercel 分配的 `*.vercel-dns-017.com` 地址 | DNS only |
| CNAME | `www` | Vercel 分配的 `*.vercel-dns-017.com` 地址 | DNS only |

当前原则：

- 使用 Cloudflare **DNS only**，不启用橙云代理。
- CDN、边缘缓存和 TLS 证书由 Vercel 提供。
- `mac-studio.quantrift.io` 等其他 Cloudflare Tunnel 记录可以保留；只要名称不同，不会影响主站。
- 不要同时在 Cloudflare 和 Vercel 配置相互冲突的重定向规则。

### 3.3 DNS 验证

```bash
dig quantrift.io
dig www.quantrift.io
curl -I https://quantrift.io
curl -I https://www.quantrift.io
```

预期：

- `quantrift.io` 返回 308，并将 `Location` 指向 `https://www.quantrift.io/`。
- `www.quantrift.io` 返回正常页面，不发生重定向循环。

---

## 4. Vercel 前端部署

### 4.1 项目设置

```text
GitHub repository: whicter/quantrift_options-lab
Production branch: master
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

绑定域名：

```text
quantrift.io
www.quantrift.io
quantrift-options-lab.vercel.app
```

推荐约定：

- `www.quantrift.io`：Production 主域名。
- `quantrift.io`：308 跳转至 `www`。
- `quantrift-options-lab.vercel.app`：Vercel 默认域名，仅用于诊断和平台验证。

### 4.2 前端环境变量

Vercel Production 环境：

```env
VITE_API_BASE_URL=https://quantriftoptions-lab-production.up.railway.app
```

要求：

- URL 末尾不要添加 `/`。
- Vite 暴露给浏览器的变量必须以 `VITE_` 开头。
- `VITE_*` 会在构建时写入静态资源，不应放置密码、Token 或数据库连接字符串。
- 修改环境变量后必须重新部署。

建议同时为 Preview 环境配置独立 API，或明确让 Preview 使用生产 API。不要无意中让 Preview 指向本地地址。

### 4.3 SPA 深层路由

React Router 页面包括：

```text
/learn
/analyze
/scan
```

为了保证用户直接输入 URL 或刷新时不出现 Vercel `404: NOT_FOUND`，`frontend/vercel.json` 应包含：

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

验证：

```bash
curl -I https://www.quantrift.io/learn
curl -I https://www.quantrift.io/analyze
curl -I https://www.quantrift.io/scan
```

浏览器中还应分别打开这些路径并刷新。

### 4.4 本地构建验证

```bash
cd frontend
npm ci
npm run build
```

构建产物应位于：

```text
frontend/dist/
```

建议在提交前本地预览：

```bash
npm run preview
```

---

## 5. Railway API 部署

### 5.1 服务设置

```text
GitHub repository: whicter/quantrift_options-lab
Production branch: master
Root Directory: server
Start Command: npm start
```

`server/package.json` 的生产启动入口：

```json
{
  "scripts": {
    "start": "node src/index.js"
  }
}
```

应用监听：

```js
const PORT = process.env.PORT || 3001;
```

Railway 会自动注入 `PORT`，生产环境通常不需要手动设置。

### 5.2 Railway 环境变量

```env
CORS_ORIGINS=https://www.quantrift.io
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
```

| 变量 | 作用 |
|---|---|
| `CORS_ORIGINS` | 逗号分隔的浏览器 Origin 白名单；生产默认只允许正式站点 |
| `DATABASE_URL` | 连接同一 Railway 项目中的 PostgreSQL |
| `NODE_ENV` | 启用生产行为及当前数据库 SSL 分支 |
| `PORT` | Railway 自动注入，不建议硬编码 |

注意：

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

是 Railway 服务变量引用，只适用于 Railway 内部。它不是本地 Mac 可解析的连接地址。

### 5.3 API 地址

Railway 公网地址：

```text
https://quantriftoptions-lab-production.up.railway.app
```

当前已验证接口：

```text
GET /health
GET /api/metrics?symbols=AAPL
GET /api/scan?minIvr=0&maxIvr=100&limit=5
```

示例：

```bash
curl -i \
  https://quantriftoptions-lab-production.up.railway.app/health

curl -i \
  "https://quantriftoptions-lab-production.up.railway.app/api/metrics?symbols=AAPL"

curl -i \
  "https://quantriftoptions-lab-production.up.railway.app/api/scan?minIvr=0&maxIvr=100&limit=5"
```

健康检查预期：

```json
{
  "status": "ok"
}
```

### 5.4 Healthcheck

Railway 服务建议设置：

```text
Settings
→ Deploy
→ Healthcheck Path
→ /health
```

健康检查应满足：

- 不依赖前端。
- 快速返回。
- 至少证明 Node.js 服务已经启动。
- 如果未来要检查数据库，建议另设 readiness endpoint，避免数据库瞬时抖动触发无意义重启。

---

## 6. Railway PostgreSQL

### 6.1 当前业务表

```text
public.iv_history
```

当前 API 对该表的依赖：

- `/api/metrics`：读取指定 symbol 的隐含波动率历史及派生指标。
- `/api/scan`：按 IV Rank 等筛选条件扫描标的。
- `/api/status/data`：读取 watchlist，并汇总 `iv_history` 覆盖率、缺失标的、stale 标的、source 分布和最新日期。
  - 默认读取 repo 内 `collector/watchlist.txt`；如果 Railway 只部署 `server/` 子目录，需要设置 `WATCHLIST_PATH` 指向部署环境中的 watchlist 文件。

价格历史表：

```text
public.price_history
public.price_history_30m
```

用途：`price_history` 保存最多 400 个调整后日线 bar，供趋势、RVol、HV 和 weekly recap 使用；`price_history_30m` 保存近 35 个自然日的 30M bar，供 breakout 与盘中结构使用。两表均由 collector upsert 到 Railway PostgreSQL。

状态：

- `server/src/migrate.js` 已包含 `price_history` 与 `price_history_30m` migration。
- 2026-07-14 已在 Railway PostgreSQL 创建 `public.price_history`。
- `collector/collect_prices.py` 已实现 OHLCV 写入逻辑。
- PM2 默认 `PRICE_PROVIDER=polygon`，同轮请求 `1/day` 与 `30/minute` aggregates，source=`polygon_licensed`。
- `POLYGON_STOCK_REQUEST_DELAY=16` 通过 `/tmp/quantrift_polygon_stock_rate_limit` 在 option/price PM2 进程之间共享 Stocks REST 节流；该值按 runtime 观察到的 4 req/min ceiling 校准。429 读取 `Retry-After`，否则按 `POLYGON_PRICE_RATE_LIMIT_BACKOFF` 退避。
- `PRICE_PROVIDER=ib_internal` 仅保留为显式 fallback，不再由 PM2 调度。
- `PRICE_PROVIDER=stooq` 仅用于显式开发/回填测试，不是生产 options data。
- Railway API 通过 `GET /api/prices/:symbol?limit=60` 读取日线，通过 `interval=30m` 读取 intraday。
- 2026-07-14 最小闭环验证：`SYMBOLS=AAPL collector/venv311/bin/python collector/collect_prices.py` 成功写入 60 rows；Railway `price_history` 中 AAPL date range 为 2026-04-17 → 2026-07-14，source=`ib_internal`。
- 本地 API 验证：`curl -f "http://localhost:3002/api/prices/AAPL?limit=3"` 成功返回 3 rows，source=`ib_internal`。
- 2026-07-14 完整 watchlist 验证：`collector/venv311/bin/python collector/collect_prices.py` 成功处理 67/67 symbols，写入 4020 rows，0 failed。
- 2026-07-14 Railway DB 覆盖验证：`price_history` 有 67 distinct symbols、4020 rows、date range 2026-04-17 → 2026-07-14、source=`ib_internal`，无少于 60 rows 的 symbol。
- 当前定时任务状态：PM2 直接运行 Mac Studio 当前 repo，不维护同步副本。
  - Config：`/Users/congrenhan/Documents/quantrift_options-lab/collector/ecosystem.config.cjs`
  - `quantrift-options-collector`：长期运行 `run_collector_daemon.py`；option coverage scheduler 300 秒（batch 2）、worker 60 秒、scanner materialization 300 秒。
  - `quantrift-options-prices`：工作日 13:35 PT / 16:35 ET 运行 repo 内 `collect_prices.py`；配置固定 `SYMBOLS=watchlist`，避免 targeted backfill 环境泄漏到下一次定时任务。
  - Python/env：repo 内 `collector/venv311` 与 `collector/.env`。
  - 旧 LaunchAgent 与 `~/.quantrift_options_collector` 已移除；不存在“先同步代码再运行”的步骤。
  - 电源恢复：2026-07-16 `pmset -g custom` 返回 AC Power `autorestart 1`，Mac Studio 已配置为市电恢复后自动开机；LaunchAgent `pm2.congrenhan` 的 `RunAtLoad=true` 执行 `pm2 resurrect`，其 saved list 包含五个 Quantrift collector apps。UPS 采购和实际断电/复电演练尚未完成；演练须检查 PM2 process list、collector health、queued jobs 与最新 snapshots。
  - Start：`cd /Users/congrenhan/Documents/quantrift_options-lab && pm2 start collector/ecosystem.config.cjs && pm2 save`
  - Inspect：`pm2 status quantrift-options-collector quantrift-options-prices`
  - Logs：`pm2 logs quantrift-options-collector --lines 50 --nostream`
  - 2026-07-15 runtime verification：collector online and materializing 67 scanner rows；price one-shot completed `4020 rows written, 0 failed` and is stopped between scheduled runs；`pm2 save` succeeded。
  - 2026-07-15 auto-refresh verification：scheduler selected missing AAPL；TT device challenge was treated as unavailable and the worker fell back to IB delayed market data without retrying login；AAPL completed 78 actual contracts、94.87% completeness，production option coverage increased 8/67 → 9/67，then continued with AIQ。
- 2026-07-14 生产 API 验证：`curl -f "https://quantriftoptions-lab-production.up.railway.app/api/prices/AAPL?limit=3"` 返回 HTTP 200，`source=ib_internal`、`count=3`、`freshness=fresh`、`is_stale=false`。
- 2026-07-14 生产 status 验证：`curl -f "https://quantriftoptions-lab-production.up.railway.app/api/status/data"` 返回 `expected_count=67`、`price_history.covered_count=67`、`missing_count=0`、`stale_count=0`。
- 2026-07-15 Polygon migration/runtime：Railway 已创建 `price_history_30m`。日线 67/67、26815 rows、每 symbol 349-401 rows、range 2024-12-05 → 2026-07-15；30M 67/67、39135 rows、每 symbol 319-736 rows、range 2026-06-10 08:00Z → 2026-07-14 23:30Z；duplicate keys 均为 0。
- 日线 source 审计：所有 symbols 都有 `polygon_licensed` history；每个 symbol 仍保留 1 条日期更新的旧 `ib_internal` row。不得为了 source 纯度删除更近 bar；scheduled dependency 已切到 Polygon。
- PM2 deployment：`quantrift-options-collector` online；`quantrift-options-prices` stopped one-shot + cron active，非敏感 env 验证为 `provider=polygon`、`symbols=watchlist`、`delay=16`、`key=True`；随后 `pm2 save` 成功。

系统 schema，例如 `pg_catalog` 和 `information_schema`，不属于业务数据，不应删除。

### 6.2 数据检查 SQL

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

```sql
SELECT COUNT(*) AS row_count
FROM public.iv_history;
```

```sql
SELECT
    MAX(date) AS latest_date,
    COUNT(DISTINCT symbol) AS symbol_count
FROM public.iv_history;
```

```sql
SELECT *
FROM public.iv_history
ORDER BY date DESC
LIMIT 10;
```

建议增加重复数据检查。实际唯一键要以表结构为准：

```sql
SELECT symbol, date, COUNT(*)
FROM public.iv_history
GROUP BY symbol, date
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
```

### 6.3 私有 URL 与公网 URL

Railway 内部服务使用私有连接：

```text
*.railway.internal
```

本地电脑、collector 和 `psql` 必须使用 Railway 提供的公网地址，通常类似：

```text
postgresql://postgres:PASSWORD@HOST.proxy.rlwy.net:PORT/railway
```

Railway 界面中查找：

```text
Postgres
→ Variables / Connect
→ DATABASE_PUBLIC_URL 或 TCP Proxy 参数
```

公网端口通常不是 `5432`，必须使用 Railway 实际显示的端口。

---

## 7. 本地开发

### 7.1 本地后端连接 Railway PostgreSQL

创建：

```text
server/.env
```

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.proxy.rlwy.net:YOUR_PORT/railway
NODE_ENV=production
CORS_ORIGIN=http://localhost:5173
PORT=3001
```

运行：

```bash
cd server
npm install
npm run dev
```

验证：

```bash
curl http://localhost:3001/health
curl "http://localhost:3001/api/metrics?symbols=AAPL"
```

当前代码如果依据 `NODE_ENV=production` 决定是否启用 PostgreSQL SSL，本地直连 Railway 时可能需要暂时保留 `NODE_ENV=production`。

长期建议将 SSL 独立配置：

```env
DATABASE_SSL=true
```

示意实现：

```js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: false },
});
```

### 7.2 本地前端连接本地后端

创建：

```text
frontend/.env.local
```

```env
VITE_API_BASE_URL=http://localhost:3001
```

运行：

```bash
cd frontend
npm install
npm run dev
```

访问：

```text
http://localhost:5173
```

链路：

```text
localhost:5173
    ↓
localhost:3001
    ↓
Railway PostgreSQL 公网地址
```

### 7.3 本地前端连接 API

默认本地开发链路应使用本地后端服务：

```text
http://localhost:5173
  → http://localhost:3001
  → Railway PostgreSQL 或本地 PostgreSQL
```

本地前端配置：

```env
VITE_API_URL=http://localhost:3001
```

本地后端配置：

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:4173
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.proxy.rlwy.net:YOUR_PORT/railway
```

生产 Railway API 默认只允许：

```text
https://www.quantrift.io
```

只有在临时调试“本地前端直接打生产 Railway API”时，才短时间加入 localhost：

```env
CORS_ORIGINS=https://www.quantrift.io,http://localhost:5173,http://127.0.0.1:4173
```

调试完成后应恢复为：

```env
CORS_ORIGINS=https://www.quantrift.io
```

`server/src/index.js` 同时兼容旧变量 `CORS_ORIGIN`，但新配置应使用 `CORS_ORIGINS`。

### 7.4 Python collector

创建：

```text
collector/.env
```

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.proxy.rlwy.net:YOUR_PORT/railway
```

`psycopg` 示例：

```python
import os
import psycopg

with psycopg.connect(
    os.environ["DATABASE_URL"],
    sslmode="require",
) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM public.iv_history")
        print(cursor.fetchone())
```

如果使用 `psycopg2`：

```python
import os
import psycopg2

connection = psycopg2.connect(
    os.environ["DATABASE_URL"],
    sslmode="require",
)
```

collector 必须具备：

- 可重入或幂等写入。
- 单个 symbol 失败不导致整个批次永久中断。
- 记录开始时间、结束时间、成功数和失败数。
- 不在日志中输出数据库密码。
- 对数据库连接和外部数据源设置超时。
- 写入完成后验证最新日期。

### 7.5 使用 psql

安装：

```bash
brew install libpq
```

连接：

```bash
export DATABASE_PUBLIC_URL='postgresql://postgres:PASSWORD@HOST.proxy.rlwy.net:PORT/railway'
$(brew --prefix libpq)/bin/psql "$DATABASE_PUBLIC_URL"
```

常用命令：

```sql
\conninfo
\dt
\d public.iv_history
SELECT COUNT(*) FROM public.iv_history;
SELECT MAX(date) FROM public.iv_history;
\q
```

---

## 8. 环境变量和 Secret 安全

不得提交：

```text
server/.env
frontend/.env.local
collector/.env
```

`.gitignore` 至少包含：

```gitignore
.env
.env.*
!.env.example
```

模板：

`server/.env.example`

```env
DATABASE_URL=
DATABASE_SSL=true
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
PORT=3001
```

`frontend/.env.example`

```env
VITE_API_BASE_URL=http://localhost:3001
```

`collector/.env.example`

```env
DATABASE_URL=
```

检查：

```bash
git ls-files | grep -E '(^|/)\.env($|\.)'
```

若真实密码曾进入 Git 历史：

1. 立即轮换 Railway PostgreSQL 密码。
2. 更新 Railway 和本地环境变量。
3. 必要时清理 Git 历史。
4. 不要认为“后续删除文件”即可使旧 Secret 失效。

---

## 9. 标准发布流程

### 9.1 发布前

```bash
git status
git pull --ff-only
```

前端：

```bash
cd frontend
npm ci
npm run build
```

后端：

```bash
cd ../server
npm ci
npm test
```

若尚无自动测试，至少执行：

```bash
npm start
curl http://localhost:3001/health
```

collector 有测试时执行：

```bash
cd ../collector
python -m pytest
```

### 9.2 发布

当前生产分支为 `master`。推送后：

- Vercel 根据 `frontend/` 变更触发构建。
- Railway 根据 `server/` 变更触发构建。
- 数据库 schema 不应通过应用启动时的隐式破坏性语句修改。
- collector 的本地部署或调度需单独更新。

### 9.3 发布后验证

域名：

```bash
curl -I https://quantrift.io
curl -I https://www.quantrift.io
```

API：

```bash
curl -f \
  https://quantriftoptions-lab-production.up.railway.app/health
```

业务接口：

```bash
curl -f \
  "https://quantriftoptions-lab-production.up.railway.app/api/metrics?symbols=AAPL"

curl -f \
  "https://quantriftoptions-lab-production.up.railway.app/api/scan?minIvr=0&maxIvr=100&limit=5"
```

浏览器验收：

- `/learn`、`/analyze`、`/scan` 可直接打开并刷新。
- DevTools Console 无未处理错误。
- Network 请求指向 Railway，而不是 `localhost:3001`。
- API 无 500。
- Analyze 能返回 AAPL 等已知标的数据。
- Scan 的筛选参数会影响结果。
- 最新数据日期符合预期。

---

## 10. 数据库 migration

当前环境如果依赖手动建表，无法可靠重建。

建议新增：

```text
server/migrations/
└── 001_create_iv_history.sql
```

migration 应包含：

- 表定义。
- 主键或唯一约束。
- 非空约束。
- 类型定义。
- 必要索引。
- 可安全重复执行或由 migration 工具记录版本。

推荐约束方向，具体字段以实际 schema 为准：

```text
UNIQUE(symbol, date)
INDEX(date)
INDEX(symbol, date DESC)
```

不要在没有备份和验证的情况下直接对生产库执行 destructive migration。

---

## 11. 备份与恢复

### 11.1 需要确认

- Railway 套餐是否提供自动备份。
- 备份频率和保留期。
- Point-in-time recovery 是否可用。
- 恢复流程由谁执行。
- 是否需要额外的离线 `pg_dump`。

### 11.2 手工备份

```bash
pg_dump "$DATABASE_PUBLIC_URL" \
  --format=custom \
  --file="quantrift-$(date +%Y-%m-%d).dump"
```

### 11.3 恢复

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --dbname="$DATABASE_PUBLIC_URL" \
  quantrift-YYYY-MM-DD.dump
```

恢复前：

- 再次确认目标数据库。
- 建议先恢复到临时数据库验证。
- 记录恢复开始和结束时间。
- 验证行数、最新日期和代表性 symbol。

---

## 12. 可观测性和告警

至少监控：

```text
Frontend JavaScript errors
API HTTP 5xx
API latency
PostgreSQL connection failures
Collector execution failures
Collector partial failures
iv_history latest_date
iv_history symbol coverage
GET /api/status/data coverage response
```

建议实现：

- 后端结构化 JSON 日志。
- 每个请求的 request ID。
- 错误监控，例如 Sentry。
- Railway 服务告警。
- collector 最后成功时间。
- 数据新鲜度告警。
- 不记录密码、完整连接字符串或用户敏感输入。

数据新鲜度查询：

```sql
SELECT
    MAX(date) AS latest_date,
    CURRENT_DATE - MAX(date) AS age_days,
    COUNT(DISTINCT symbol) AS symbol_count
FROM public.iv_history;
```

需要根据美股交易日而不是自然日设置告警阈值。

---

## 13. API 安全

Railway URL 可被浏览器看到，这本身不是安全漏洞。真正的安全边界包括：

- 参数校验。
- 查询超时。
- 最大 `limit` 硬限制。
- Rate limiting。
- 数据库最小权限。
- CORS 允许列表。
- 安全日志。
- 错误响应不泄露 SQL、堆栈或连接信息。
- 必要时增加身份验证和授权。

建议：

```text
GET /api/scan
- minIvr 和 maxIvr 必须是有限数字
- 0 <= minIvr <= maxIvr <= 100
- limit 必须是整数
- limit 必须有服务端上限
```

CORS 只限制浏览器，不阻止服务器、脚本或 curl 调用 API，因此不能把 CORS 当作认证机制。

---

## 14. 常见故障排查

### 14.1 Vercel 页面 404

症状：

```text
/ 可以打开
/analyze 刷新后 404
```

检查：

- `frontend/vercel.json` 是否存在。
- Vercel Root Directory 是否为 `frontend`。
- rewrite 是否已进入当前生产部署。

### 14.2 前端仍请求 localhost

检查：

- Vercel 的 `VITE_API_BASE_URL`。
- 修改变量后是否重新部署。
- 浏览器 Network 面板中的实际 Request URL。
- 是否存在硬编码 `http://localhost:3001`。

### 14.3 CORS 错误

检查：

- 请求 Origin。
- Railway 中 `CORS_ORIGIN` 或 `CORS_ORIGINS`。
- 是否误写成 `https://quantrift.io` 而前端实际为 `https://www.quantrift.io`。
- 是否有尾部 `/` 导致字符串不一致。

### 14.4 Railway 服务启动失败

检查：

- Root Directory 是否为 `server`。
- `npm start` 是否存在。
- 入口是否为 `src/index.js`。
- 应用是否监听 `process.env.PORT`。
- Railway Deploy Logs。
- 所有必须环境变量是否存在。

### 14.5 数据库连接失败

检查：

- Railway 内部服务是否使用私有 `DATABASE_URL`。
- 本地是否错误使用 `*.railway.internal`。
- 本地公网 host 和 port 是否正确。
- SSL 是否启用。
- 数据库密码是否已轮换。
- Railway Postgres 服务是否在线。

### 14.6 API 返回空数据

检查：

```sql
SELECT MAX(date), COUNT(DISTINCT symbol)
FROM public.iv_history;

SELECT *
FROM public.iv_history
WHERE symbol = 'AAPL'
ORDER BY date DESC
LIMIT 10;
```

可能原因：

- collector 未运行。
- symbol 格式不一致。
- 数据日期过旧。
- 写入事务回滚。
- 查询条件过严。
- IV Rank 所需历史窗口不足。

### 14.7 Scan 很慢

检查：

- SQL 是否全表扫描。
- `symbol/date` 是否有索引。
- `limit` 是否有上限。
- 是否在每次请求重复计算整个历史窗口。
- Railway PostgreSQL CPU、内存和连接数。
- API latency 日志。

---

## 15. 当前状态清单

| 项目 | 状态 |
|---|---|
| Cloudflare 管理域名 | 已完成 |
| `www.quantrift.io` 指向 Vercel | 已完成 |
| 根域名 308 跳转至 `www` | 已完成 |
| Vercel 前端部署 | 已完成 |
| React Router 深层路由 rewrite | 已完成 |
| Railway Express API 部署 | 已完成 |
| Railway PostgreSQL | 已完成 |
| `public.iv_history` | 已完成 |
| 前端通过 `VITE_API_BASE_URL` 调用 API | 已完成 |
| 正式域名 CORS | 已完成 |
| Railway `/health` 接口 | 已完成 |
| 生产域名和 API curl 验收 | 已完成（2026-07-14） |
| Railway Healthcheck Path | 需要在平台中确认 |
| collector 定时运行 | 已安装（Mac Studio PM2 直接运行 repo；worker/scanner 常驻，OHLCV 工作日 13:35 PT） |
| collector 失败告警 | 建议补充 |
| 数据新鲜度告警 | 建议补充 |
| 数据库 migration | 建议补充 |
| 自动备份和恢复演练 | 建议补充 |
| API rate limit | 建议补充 |
| 前后端错误监控 | 建议补充 |

---

## 16. 常用地址

正式网站：

```text
https://www.quantrift.io
```

根域名：

```text
https://quantrift.io
```

Vercel 默认地址：

```text
https://quantrift-options-lab.vercel.app
```

Railway API：

```text
https://quantriftoptions-lab-production.up.railway.app
```

健康检查：

```text
https://quantriftoptions-lab-production.up.railway.app/health
```

Metrics：

```text
https://quantriftoptions-lab-production.up.railway.app/api/metrics?symbols=AAPL
```

Scan：

```text
https://quantriftoptions-lab-production.up.railway.app/api/scan?minIvr=0&maxIvr=100&limit=5
```

---

## 17. 暂时不需要引入的复杂度

当前规模下，以下项目不是上线阻塞项：

- Kubernetes。
- 多区域 active-active。
- Redis。
- 消息队列。
- 微服务拆分。
- Cloudflare 橙云代理。
- 自定义 `api.quantrift.io`。
- 将 collector 强制迁移到 Railway。
- 多租户。
- 复杂服务网格。

优先级应是：

1. 数据持续更新。
2. API 正确性。
3. migration 和备份。
4. 错误与数据新鲜度告警。
5. 参数校验和 rate limit。
6. 根据真实流量再决定是否扩容或拆分。

---

## 18. Option Chain 数据源边界

产品目标包含 Call Wall、Put Wall、Global GEX、Local Gamma、Gamma Flip、strike-level GEX、Max Pain、PCR、IV Skew、OI concentration 和 Unusual OI delta。

这些功能依赖 option chain、open interest、volume、Greeks、IV 和 underlying price。当前部署遵守：

- 普通用户输入 symbol 时，Railway API 读取 PostgreSQL 中已采集/预计算的 snapshot，不同步等待 Mac Studio IB Gateway。
- IB/TT provider adapter 只存在于 collector 边界。
- 前端和 API contract 绑定业务指标，不绑定具体 provider。
- IB delayed market data type `3` 可写入当前过渡 snapshot。

异步数据路径：

```text
IB / TT / future provider adapter
  → ingestion job / collector
  → PostgreSQL option_chain_snapshots / gex_snapshots
  → Railway API
  → Vercel frontend
```

允许的内部验证路径：

```text
Mac Studio IB Gateway
  → internal research collector
  → staging / internal snapshots
  → GEX algorithm validation
```

不建议的公开产品路径：

```text
user request
  → Railway API
  → local Mac Studio IB Gateway
  → synchronous option chain fetch
  → user response
```

该路径存在授权、延迟、pacing limit、Gateway session、2FA、本地机器可用性和故障隔离问题。

## 19. Cache / Freshness 运行约束

真实 options provider 接入后，生产体验应以快照缓存为中心，而不是按用户请求实时现拉数据。

请求路径：

```text
Vercel frontend
  → Railway API
  → PostgreSQL latest snapshot
  → optional API memory cache
  → response with freshness metadata
```

刷新路径：

```text
collector / worker
  → licensed provider
  → PostgreSQL snapshots
  → provider_fetch_jobs status
```

Phase 3C implemented runtime:

```text
collector/materialize_scan.py
  → scanner_results_snapshots
  → /api/scan reads latest materialized batch

collector/materialize_oi_delta.py
  → option_oi_delta_snapshots
  → /api/unusual/:symbol
  → /api/scan unusual filters

Railway API enqueue
  → provider_fetch_jobs
  → collector/run_refresh_worker.py
  → provider_request_usage
  → /api/status/cache
```

Endpoint 行为：

| Endpoint | Fresh snapshot | Stale snapshot | Missing snapshot |
| --- | --- | --- | --- |
| `/api/metrics` | 200 data | 200 stale data + refresh if needed | 202 queued / unavailable |
| `/api/gex/:symbol` | 200 data | 200 stale data + enqueue refresh | 202 queued / unavailable |
| `/api/chain/:symbol` | 200 data | 200 stale data + enqueue refresh | 202 queued / unavailable |
| `/api/scan` | 200 precomputed result | 200 stale result + refresh if needed | empty state, no mock substitution |

Response metadata must include:

```json
{
  "snapshot_ts": "2026-07-14T20:30:00.000Z",
  "source": "licensed_options_provider",
  "freshness": "fresh",
  "is_stale": false,
  "refresh_status": "none"
}
```

Operational rules:

- Do not synchronously call provider from a normal user request.
- Do not call local Mac Studio / IB Gateway from public Railway request path.
- Do not substitute mock data when a production symbol is missing.
- For stale data, return the latest usable snapshot and clearly mark it stale.
- Manual refresh should create or reuse a `provider_fetch_jobs` row.
- Per-symbol refresh should be rate-limited to at least 60 seconds.
- Scanner results should be precomputed and cached; avoid full-market scans in request path.
- Secrets：`POLYGON_API_KEY` 等 provider credentials 只放在 Mac Studio `collector/.env` 或部署平台 secret store；禁止写入 `ecosystem.config.cjs`、文档或 Git。修改 secret 后使用 PM2 reload/update-env 并验证 provider health，不打印 secret 值。
- Pre-deploy regression：`cd collector && venv311/bin/python -m unittest discover -s tests -p 'test_*.py'`，然后 `cd ../server && npm test`；后者验证 `/api/gex` fresh/missing/stale 不同步调用 provider。
- Collector health env：`COLLECTOR_HEALTH_CHECK_ENABLED=true`、`COLLECTOR_HEALTH_CHECK_SECONDS=300`、`HEALTH_MIN_COVERAGE_PCT=95`、`HEALTH_MAX_FAILED_24H=0`、`HEALTH_MAX_SNAPSHOT_AGE_MINUTES=180`、`HEALTH_MIN_COMPLETENESS_PCT=75`、`HEALTH_ALERT_COOLDOWN_MINUTES=60`。
- Operator channel：配置 `ALERT_WEBHOOK_URL` 或完整 SMTP (`SMTP_HOST/PORT/USER/PASS` + `ALERT_EMAIL`)；均缺失时只写 PM2 warning log。用 `SELECT status, last_seen_at, last_notified_at FROM collector_health_alerts` 验证 dedupe/resolution。
- 2026-07-15 runtime：health checker 已由 `quantrift-options-collector` 每 300 秒执行，Railway 已记录 active alert；随后执行 `pm2 save`，当前进程与 health env 已写入 `/Users/congrenhan/.pm2/dump.pm2`。
- Scanner UI must convert cached rows plus actual quoted contracts into complete actionable candidates. `不限` applies no hidden preset and enumerates the current 1-90 DTE ingestion window; named presets explicitly narrow it. Do not expose snapshot DTE ranges or fixed placeholder POP as recommendations.
- Candidate deployment acceptance：the row shows an exact expiry/DTE, actual legs, executable-side credit/debit, max loss, breakeven and opportunity score; incomplete/non-positive-credit structures are absent.
- `不限` acceptance：one symbol may produce multiple rows; all qualifying supported strategies/expiries/strikes are returned, while strategy chips narrow the enumeration explicitly.
- Track provider budget, stale snapshot age, failed jobs, queue backlog and empty snapshots.

Operational commands:

```bash
# Run schema migrations
cd server
node src/migrate.js

# Refresh scanner cache
cd collector
venv311/bin/python materialize_scan.py

# Refresh OI delta / unusual activity
venv311/bin/python materialize_oi_delta.py

# Process queued refresh jobs
venv311/bin/python run_refresh_worker.py

# Start persistent Mac Studio runtime directly from this repository
cd /Users/congrenhan/Documents/quantrift_options-lab
pm2 start collector/ecosystem.config.cjs
pm2 save

# Inspect runtime
pm2 status quantrift-options-collector quantrift-options-prices
pm2 logs quantrift-options-collector --lines 50 --nostream
```

IB option ingestion defaults to `IB_MARKET_DATA_TYPE=3`. Contract discovery must use actual `reqContractDetails` results with valid `conId`; never create local expiration/strike/right combinations.

Monitoring endpoint:

```bash
curl -f "$API_BASE/api/status/cache"
```

`/api/status/cache` reports provider job failures, queue backlog, scanner cache age, empty/metadata-only option snapshots and provider budget usage.

Suggested TTLs:

| Data | TTL / cadence |
| --- | --- |
| IV Rank / IV30 / HV | daily or after close |
| Earnings | daily |
| Option chain quote / IV / Greeks | 1-5 minutes |
| Open interest | provider cadence, often daily |
| GEX / Walls / Gamma Flip | after option chain refresh |
| Scanner results | 1-5 minutes |

## Derived Volatility Operations

Schema migration creates `volatility_history` and scanner provenance columns. After migration:

```bash
cd /Users/congrenhan/Documents/quantrift_options-lab/collector
VOLATILITY_BACKFILL=true venv311/bin/python derive_volatility.py
venv311/bin/python materialize_scan.py
```

Runtime env：`DERIVED_VOLATILITY_ENABLED=true`、`DERIVED_VOLATILITY_SECONDS=3600`、`IV_RANK_MIN_OBSERVATIONS=252`、API/materializer `USE_DERIVED_VOLATILITY=true`。

Acceptance must establish 67-symbol HV/ATM coverage, ATM DTE 30–45, source provenance, and rank readiness separately. Do not treat `iv_rank_ready=0` as a collector failure before 252 independent market days exist. Rollback is `USE_DERIVED_VOLATILITY=false`, followed by scanner rematerialization and API restart.

2026-07-15 evidence：Railway migration succeeded；17-symbol Polygon supplement wrote 17 snapshots/0 failures；derived run wrote 67 latest HV + 67 ATM observations；scanner has 67 Polygon HV sources, 67 Polygon IV sources, 67 Tastytrade cold-start rank sources, and 0 premature derived ranks. PM2 collector was restored online and saved.

## Scanner Quote Fallback Operations

- Configure `SCANNER_QUOTE_STALE_MINUTES=1440` for the current delayed quote transition. Lower it when quote collection cadence improves.
- `/api/scan` must return `quote_source`, `quote_snapshot_ts`, and `quote_freshness` beside the final `concrete_setup` candidate DTO; raw `option_contracts` remain internal.
- Acceptance distinguishes latest positioning coverage from latest usable bid/ask coverage. A successful GEX snapshot is not evidence of candidate-pricing readiness.
- Runtime smoke command：start the API against Railway, request `/api/scan?minIvr=0&maxIvr=100&limit=2`, and verify `quoted_contract_count > 0`, non-empty `concrete_setup`, New York DTE, quote provenance, and absence of `option_contracts`.
- Rollback is the scanner section commit; no migration is required.

## Universe and On-Demand Operations

After deploying the additive migration, seed the persistent registry and rematerialize scanner rows:

```bash
cd /Users/congrenhan/Documents/quantrift_options-lab/collector
venv311/bin/python sync_universe.py
venv311/bin/python materialize_scan.py
```

Smoke test an uncached symbol with `GET /api/analyze/{symbol}`. The first response may be `queued`; later responses must become `ready`, `partial`, or `blocked` by field. Repeating a request after a recent non-retryable metrics failure must leave `queue_depth=0`, not create another job. `/api/status/data` exposes total/active/scannable universe counts and metadata population counts.

Rollback is the P1.3 commit plus API/collector restart. The additive `symbol_universe` table and scanner columns may remain in PostgreSQL; older code ignores them. No destructive down migration is required.

## Market and Weekly Smoke Checks

```bash
curl -f "$API_BASE/api/market/regime"
curl -f "$API_BASE/api/weekly/AAPL"
```

Acceptance requires SPY/QQQ per-instrument momentum and GEX provenance, an explicit 30M `ready|stale|missing` state, and no confirmed breakout from stale bars. Weekly acceptance requires five actual candles and local missing states for unavailable GEX, Max Pain or ΔOI. A wrong-side Wall must never become a breakout trigger.

No migration or collector restart is required for this section. Deploy/restart the Node API and frontend. Rollback is the P1.4 commit; existing snapshots remain unchanged.

## Product Home Deployment

The Vercel artifact must include `public/quantrift-scanner.png` and route `/` to `Home.jsx`. Smoke checks: `/` returns the Quantrift heading, brand navigation returns to `/`, and Scan/Analyze/Weekly links route client-side. No new environment variable is required; the live strip reuses `VITE_API_URL` and `/api/market/regime`.

Verification: frontend tests 19/19, changed-file lint 0 errors and Vite production build passed. Browser plugin initialization still failed with `Cannot redefine property: process`, so automated screenshot verification was not claimed. Rollback is the P2.1 commit.

## Scanner Alert Deployment

Run the additive migration, install collector requirements, and restart the direct-repository PM2 process:

```bash
cd /Users/congrenhan/Documents/quantrift_options-lab
set -a; source collector/.env; set +a
NODE_ENV=production node server/src/migrate.js
collector/venv311/bin/pip install -r collector/requirements.txt
pm2 restart quantrift-options-collector --update-env
pm2 save
```

Email requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Web Push requires one VAPID pair: public key in Railway `WEB_PUSH_VAPID_PUBLIC_KEY`; private key and `WEB_PUSH_VAPID_SUBJECT` in Mac Studio `collector/.env`. Never put the private key in Vercel or Git.

Smoke checks: `GET /api/alerts/vapid-public-key`; create a consented test subscription; run `collector/venv311/bin/python evaluate_scanner_alerts.py`; inspect `scanner_alert_deliveries`; unsubscribe through its token. Without secrets, expected status is `blocked`. With secrets, require a real inbox/browser receipt before calling external delivery verified. Rollback disables subscriptions and reverts P2.2; additive tables may remain.

## Mac Studio Heartbeat

Generate one random shared secret and configure it in both Railway (`HEARTBEAT_TOKEN`) and the Mac Studio `collector/.env`. Mac Studio also needs:

```bash
HEARTBEAT_URL=https://quantriftoptions-lab-production.up.railway.app/api/heartbeat
HEARTBEAT_NODE_ID=mac-studio
HEARTBEAT_SECONDS=60
```

Railway settings:

```bash
HEARTBEAT_EXPECTED_NODES=mac-studio
HEARTBEAT_MAX_AGE_SECONDS=180
HEARTBEAT_MONITOR_SECONDS=60
HEARTBEAT_ALERT_COOLDOWN_SECONDS=3600
HEARTBEAT_MONITOR_ENABLED=true
ALERT_WEBHOOK_URL=
```

After Railway deploy, restart `quantrift-options-collector --update-env`, then verify `GET /api/heartbeat/status` changes from `missing/degraded` to `online/ok`. Stop the daemon for longer than 180 seconds and confirm an active row in `collector_heartbeat_alerts`; restart it and confirm `resolved`. Without `ALERT_WEBHOOK_URL`, persistence is verified but channel status is `blocked`. Rollback sets `HEARTBEAT_MONITOR_ENABLED=false` and removes Mac heartbeat URL/token; tables are additive and can remain.

2026-07-15 evidence: migration passed; local API against Railway PostgreSQL confirmed missing, HTTP 401, accepted and online states. A controlled stale report created an active blocked incident, and a new report resolved it. Mac Studio PM2 collector was restarted and remained online. Shared production token and webhook are intentionally not invented by code and remain deployment prerequisites.

## Derived IV Rank Cutover

No manual switch is required at 252 observations. Keep `USE_DERIVED_VOLATILITY=true` and `IV_RANK_MIN_OBSERVATIONS=252`. The scheduled metrics collector filters ready symbols before TT authentication; queued symbol metrics jobs also short-circuit as `already_ready`; Analyze treats ready derived rank as metrics coverage.

Operational check:

```sql
SELECT COUNT(DISTINCT symbol)
FROM volatility_history
WHERE iv_rank_ready = TRUE;
```

2026-07-15 runtime result is 0/67 ready, therefore TT cold-start collection remains expected. Never lower the threshold or duplicate market dates to force readiness. Rollback can set `USE_DERIVED_VOLATILITY=false`, but doing so intentionally resumes provider rank consumption.

## Railway Metrics Cron

The separate Railway service is `quantrift-metrics-cron`. Its config file path is `/collector/railway.metrics.json`; it selects `collector/Dockerfile.metrics`, runs `python run_railway_refresh_cycle.py`, schedules `*/5 * * * 1-5` UTC and never restarts a completed run. Each execution schedules bounded watchlist refresh work, consumes API/on-demand jobs, then materializes scanner rows. Railway requires cron jobs to exit and evaluates schedules in UTC ([Railway cron documentation](https://docs.railway.com/cron-jobs)).

The Railway build context remains the repository root even when the config file is inside `collector/`. Therefore the Dockerfile path and `COPY` sources must be repo-root-relative: config uses `collector/Dockerfile.metrics`, and the Dockerfile copies `collector/requirements.txt` and `collector/`. Do not rely on the config path to change build context.

Required variables:

```text
DATABASE_URL=<Railway PostgreSQL reference variable>
POLYGON_API_KEY=<Polygon/Massive secret>
```

Do not copy `collector/.env` into the service. `POLYGON_API_KEY` must be a service-scoped Railway secret and must be present before any manual `Run now` or scheduled execution. It is the primary provider for the cloud option-chain refresh. `TT_*` variables are not a production requirement for this path: `TT_METRICS_ENABLED=false`, and TT is only a bounded fallback when Polygon cannot return usable quotes.

Production acceptance, 2026-07-17: after adding the Railway `POLYGON_API_KEY` and deploying the variable change, a manually triggered cron execution completed two `option_chain_snapshot` jobs successfully, materialized 4,826 OI-delta rows, and materialized 80 scanner rows. The earlier execution without this secret immediately failed provider construction and fell back into the Railway Tastytrade device challenge. Treat the log line `POLYGON_API_KEY is required for PolygonOptionChainProvider` as a configuration failure: deploy the secret first, then rerun the cron; do not diagnose it as an option-data or TT-token failure.

Repository verification: `cd collector && ./venv311/bin/python -m unittest discover -s tests -v` passed 111 tests; `docker build -f collector/Dockerfile.metrics -t quantrift-metrics-cron:test .` passed. A read-only Railway DB check at the failed-run point found 76 `iv_history` rows across 76 symbols, all dated 2026-07-14; the failed run made no new rows.

## IB Gateway VPS Candidate

Use `ops/ib-gateway/docker-compose.yml` only on a fixed-egress VPS. Copy `.env.example` to an untracked `.env`, create `secrets/tws_password.txt` with mode 600, and keep the host firewall closed to 4001/4002. The template binds both ports to `127.0.0.1` and starts in paper/read-only mode.

Acceptance requires:

1. Manual first 2FA and verified settings persistence.
2. Collector connection through localhost/private network only.
3. Nightly auto-restart, container restart and full VPS reboot tests.
4. Disconnect/reconnect and stale-data fail-closed checks.
5. Unique IB client IDs and no conflict with trading processes.
6. 72 hours of coverage/freshness parity before moving the read-only collector.

Never switch this template to live/write access as part of a data migration. That is a separate deployment and business-behavior approval. `docker compose config --no-interpolate` and 85 collector tests pass; no VPS/2FA runtime is claimed.

## Clerk Account Rollout

Railway variables:

```text
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_AUTHORIZED_PARTIES=https://www.quantrift.io
AUTH_ENFORCEMENT_ENABLED=false
```

Vercel variable: `VITE_CLERK_PUBLISHABLE_KEY`. Apply the additive migration before enabling frontend auth, deploy both sides, sign in, and verify `GET /api/account/me` creates one `users` row and one Free `subscriptions` row. Keep enforcement false until Stripe/entitlement gates are verified.

Code verification: server 43 tests, frontend 19 tests and production build passed. On 2026-07-15 `node server/src/migrate.js` completed against Railway PostgreSQL; a read-only `information_schema` query confirmed `users`, `subscriptions`, `positions`, `position_legs`, and `stripe_webhook_events`. Real Clerk sign-in is not verified because keys are not configured.

## Portfolio Rollout

The same additive migration creates `positions` and `position_legs`. After Clerk sign-in is verified, create a bounded test spread in `/portfolio`, confirm ownership in PostgreSQL, and verify marks come from an actual matching `option_contract_snapshots` row. Then close it and confirm status/`closed_at` change without deletion.

Acceptance requires one fully priced spread with P/L and aggregate Greeks, plus one intentionally unmatched leg that displays `待报价`. Verify a second Clerk user cannot list or close the first user's position. Current evidence is server 46 tests, frontend 21 tests, production build and applied Railway schema; signed-in runtime evidence is pending Clerk keys.

## Stripe Billing Rollout

Railway secrets:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
PUBLIC_APP_URL=https://www.quantrift.io
AUTH_ENFORCEMENT_ENABLED=false
```

Configure Stripe webhook endpoint `https://quantriftoptions-lab-production.up.railway.app/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Run a test-mode checkout and verify one idempotency row per event, Pro activation, Customer Portal return, cancellation downgrade and replay safety.

Only after signed-in scanner/Analyze/alerts/portfolio requests all carry Clerk bearer tokens should enforcement become true. Rollback is one variable change to false; do not edit subscription rows manually. Current evidence is server 56 tests, frontend 21 tests, production build and applied Railway schema. Real Stripe lifecycle is blocked on the three Stripe values.

## Frontend Verification Baseline

Before deployment, run `cd frontend && npm run lint && npm test && npm run build`. On 2026-07-15 this completed with ESLint 0 errors/0 warnings, 21/21 tests and a successful Vite build. The only remaining build output is the non-failing main-chunk size warning. Rollback is the frontend verification commit; no schema, secret or collector change is involved.

## V3A Immediate Core Deployment (2026-07-16)

Deploy Railway API and Vercel frontend together from commit `9fd90e9`. This is an API-contract change: `/api/scan` now returns final candidate rows with `concrete_setup`; it no longer returns the full `option_contracts` array. No migration, collector restart or secret change is required.

Verification:

```bash
cd server && npm test
cd ../frontend && npm test && npm run build
test -z "$(find dist -type f -name '*.map' -print -quit)"
curl -fsS "https://quantriftoptions-lab-production.up.railway.app/api/scan?minIvr=40&maxIvr=100&limit=5"
```

Confirm the production response has candidate rows with `concrete_setup` and no `option_contracts` property. Rollback is reverting `9fd90e9` in both deployments; this commit has no schema or collector state to reverse.

## OI Density Rollout

Deploy the Node API and frontend; no migration or collector restart is required. Verify `/api/chain/stats/PLTR` returns `oi_density.status=ready`, OI-specific source/freshness, nonempty points and `aggregation=all_nonexpired_expiries`. Then verify Analyze Tab4 labels the chart `OI by Strike`, shows Put/Call legend and never displays GEX values as OI.

2026-07-15 pre-deploy evidence: server 58/58, frontend 21/21, full ESLint and Vite build passed. Local API against Railway data returned fresh Polygon PLTR OI with 7 expiries, 84 contracts, 11 strikes and total OI 307,713. Rollback is the OI-density commit; endpoint additions are backward compatible.

## Reddit Trends Rollout

Reddit requires OAuth for Data API access. Obtain the approved app credentials, then set only in Mac Studio secret environment:

```text
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=macos:quantrift:1.0 (by /u/<account>)
REDDIT_TRENDS_ENABLED=true
REDDIT_SUBREDDITS=wallstreetbets,stocks,options,investing
REDDIT_WINDOW_HOURS=24
```

Apply `node server/src/migrate.js`, then `pm2 restart quantrift-reddit-trends --update-env && pm2 save`. Acceptance requires one `community_trend_snapshots` row, symbol rows limited to `symbol_universe`, and `/api/scan` returning a fresh community field/visible sortable heat column. Disable rollback with `REDDIT_TRENDS_ENABLED=false`; existing snapshots may remain.

2026-07-15 evidence: additive migration completed and both tables were read-only confirmed; empty-table Scanner smoke returned the original candidate plus `community_freshness=missing`; PM2 job is saved and logs `Reddit trends disabled`. Collector 90, server 58 and frontend 23 tests, full lint and build pass. Real Reddit response is not claimed without credentials/access. Official access references: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki and https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data.

Enabled-path schema regression (2026-07-15): `load_universe` now queries the actual `scan_enabled` column and has a direct database-contract test. This fixes a failure that disabled credential execution could not expose; collector 96/96 passes.

## Universe Reference Metadata Rollout

`collect_universe_metadata.py` is a Polygon reference-data one-shot. It reads `symbol_universe.active=TRUE AND scan_enabled=TRUE`, fetches `/v3/reference/tickers/{symbol}`, and updates ticker name, asset type, market cap, SIC metadata, derived sector/category and optionable status. It preserves existing non-reference fields unless they were previously written by the same reference source.

Runtime evidence on 2026-07-16:

- Command: `REFERENCE_METADATA_ENABLED=true ./venv311/bin/python collect_universe_metadata.py`
- Git commit at runtime: local working tree before this section commit
- Configuration: `DATABASE_URL` from `collector/.env`; `POLYGON_API_KEY` inherited from the existing PM2 collector secret; `POLYGON_STOCK_REQUEST_DELAY=16`; `POLYGON_REFERENCE_RATE_LIMIT_BACKOFF=60`
- Data source: Polygon ticker reference endpoint plus existing Railway `option_chain_snapshots`
- Result: 78 symbols, 77 updated, 1 missing (`VIX`), 0 failed
- Coverage: `symbol_universe` active/scan-enabled total 78; reference source 77; non-null name 77; non-null market cap 27; non-null sector/category 28; optionable true 69
- Scanner materialization: `./venv311/bin/python materialize_scan.py` wrote 78 rows for `scan_key=watchlist_v1`; latest scanner snapshot contains market cap 27, sector/category 28 and optionable true 69
- PM2: `quantrift-universe-metadata` saved as a stopped one-shot with cron still active at `15 12 * * 0`

Rollback: stop/delete the PM2 process and revert the commit. The DB updates are additive metadata; older code can ignore them. If needed, reference-authored fields can be cleared where `metadata->>'reference_source'='polygon_reference'`.

## Unusual Whales Flow Rollout

The WebSocket transport requires the connection values issued for the account. Store them only in the Mac Studio collector secret environment:

```text
UW_FLOW_ENABLED=true
UW_WS_URL=wss://<account-issued-endpoint>
UW_API_TOKEN=<secret>
UW_WS_SUBSCRIBE_JSON={"topics":["flow-alerts","all-trade-report"]}
UW_USER_AGENT=Quantrift/1.0
```

The subscription JSON above is illustrative; use the exact account-issued envelope. Apply `node server/src/migrate.js`, then `pm2 startOrRestart collector/ecosystem.config.cjs --only quantrift-unusual-whales-flow --update-env && pm2 save`. Verify `external_flow_provider_state.last_message_at` advances, duplicate event count is zero, and `/api/flow/AAPL` distinguishes active/quiet from stale/missing. Confirm one official sweep and one `market_center=L/2` TRF print in Analyze. Rollback with `UW_FLOW_ENABLED=false`; persisted events remain auditable.

With flow disabled, PM2 should show one stable online process whose log says `PM2 worker idle`; it must not accumulate restart count. After enabling the secrets, restart the named process so it leaves idle mode and connects.

Code evidence: collector 95 tests, server 62 tests, frontend 25 tests, full ESLint and Vite build pass. Railway additive migration completed; read-only verification found both tables with `event_count=0`, and the API/UI missing contract is verified without fabricated events. Mac Studio PM2 registration is saved; disabled runtime stayed online with restart count 0 and an explicit idle log. Real stream/database/UI acceptance remains pending the three account connection values. Official schemas: https://api.unusualwhales.com/docs/kafka/types/FlowAlert and https://api.unusualwhales.com/docs/kafka/types/TradeReport.

## Composite Momentum Rollout

No migration or collector restart is required. Deploy the Node API and frontend, then call `/api/sr/AAPL`. Verify `momentum.weights` is `30m=0.3`, `1d=0.4`, `1w=0.3`, all three component scores are present, and the latest daily/intraday New York market dates agree before treating status as ready.

2026-07-15 Railway read-only replay used 250 AAPL daily rows and 200 regular-session 30M rows. It returned composite 84 (`30M=50`, `1D=100`, `1W=95`) and correctly marked stale because daily was 2026-07-15 while intraday was 2026-07-14. Collector 95, server 65, frontend 25, full ESLint and production build pass. Rollback is the composite-momentum commit; `/api/sr` additions are backward compatible and have no schema changes.

## Quote Refresh Acceptance (2026-07-17)

The Railway refresh cron must provide `DATABASE_URL`; if it is expected to call Polygon directly it must also provide `POLYGON_API_KEY`. Absence of that key is recoverable for an option job when a configured local fallback can run, but it is visible in worker logs and must not be mistaken for “the symbol has no options.” The cloud cron uses Polygon as its primary refresh provider and does not authenticate TT.

Acceptance command and result:

```bash
curl -fsS https://quantriftoptions-lab-production.up.railway.app/api/analyze/RKLB
curl -fsS https://quantriftoptions-lab-production.up.railway.app/api/analyze/RKLB/candidate
```

On 2026-07-17, the first response reported all five coverage fields including `option_quotes=true`; the second returned a server-generated Diagonal Spread with real bid/ask legs and its persisted snapshot timestamp. A failed chain without valid bid/ask must remain unavailable, never receive fabricated quotes. Rollback is the corresponding collector/API commit; persisted snapshots remain additive and can be superseded by a later real refresh.
