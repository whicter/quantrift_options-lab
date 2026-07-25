# 交接单 — IV 回填任务(2026-07-25)

> 写给"重启 session 后接手的人/agent"。**不依赖任何会话上下文**,照着做即可。
> 起因:当前会话 transcript 已 30MB、连续运行 8 天,用户计划任务跑完后重启新
> session。回填 worker 用 `nohup` 起、`ppid=1`,**不受会话重启影响**。

## 1. 当前在跑什么

3 个并行 worker,回填 **120 个标的**的 constant-30-day ATM IV 历史(各 ~275 个交易日)。

| 项 | 值 |
|---|---|
| 进程 | `backfill_iv_history.py`,3 个,`ppid=1`(已脱离 shell) |
| 日志 | `/tmp/w0.log` `/tmp/w1.log` `/tmp/w2.log` |
| 标的分片 | `/tmp/p0.txt` `/tmp/p1.txt` `/tmp/p2.txt`(各 40 个) |
| 全量待办清单 | `/tmp/need_final.txt`(120 个) |
| 预计耗时 | 约 2.5 小时(串行需 7.3 小时) |

查进度:
```bash
for i in 0 1 2; do echo -n "w$i: "; grep -c "backfill {" /tmp/w$i.log; done
ps -eo pid,etime,command | grep "[b]ackfill_iv_history"   # 空 = 全部跑完
```

## 2. ⚠️ 跑完后必须做的核查(不能只看退出码)

同日刚修过一个 bug:`occ_ticker` 不剥标点导致 BRK.B **"275/275 天已处理"但 0 天算出数据**,
退出码 0、零告警。所以**验收标准是 `computed`/`written` 非零**。

```bash
# 列出所有零结果
cat /tmp/w*.log | grep "backfill {" | grep "'computed': 0"
```

两种零值含义完全不同:

| 日志形态 | 含义 | 处理 |
|---|---|---|
| `days: 275, computed: 0` | 🐛 **bug** — 请求全失败 | 必须排查 |
| `days: 0, computed: 0` | ✅ 正常 — 该标的窗口内无价格历史 | 无需处理 |

已知的正常零结果:`ACAC`(已退市 SPAC,`days: 0`)。

## 3. 跑完后的收尾步骤

```bash
cd /Users/congrenhan/Documents/quantrift_options-lab/collector
set -a; source .env; set +a

# (1) 触发 IV Rank 就绪判定(回填脚本自己不做这步)
PROVIDER_RATE_LIMIT_BACKEND=file venv311/bin/python -c "
import derive_volatility as dv
print(dv.run(backfill=False))
"
```

```bash
# (2) 核对最终状态:watchlist 里还有多少没到 250 天
cd ../server && node -e "
const fs=require('fs'); const {Pool}=require('pg');
require('dotenv').config({path:'../collector/.env'});
const pool=new Pool({connectionString:process.env.DATABASE_URL});
(async()=>{
  const wl=fs.readFileSync('../collector/watchlist.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
  const r=await pool.query('SELECT symbol,COUNT(*) n FROM volatility_history GROUP BY symbol');
  const have=new Map(r.rows.map(x=>[x.symbol,Number(x.n)]));
  const need=wl.filter(s=>(have.get(s)||0)<250);
  console.log('watchlist:',wl.length,'| 仍不足 250 天:',need.length);
  console.log(need.join(' '));
  await pool.end();
})();
"
```

不足 250 天的多数是**真·稀疏/新上市**(如 `DRAM` 2026-04 上市仅 75 天、`EYES`/`MINE`/`UP`
等小盘),属数据年龄限制**不是 bug**,归入既有的"真·稀疏/新上市"分类即可。

## 4. 收尾后要更新的文档

- `docs/validation/IV_BACKFILL_PARALLEL_2026-07-25.md` — 补最终结果(成功数/零结果清单/实际耗时)
- `docs/task.md` — 第 0 节 `2026-07-25 — Watchlist 用户大批量重排 + 清洗` 条目下补回填完成情况

## 5. 本轮已完成并推送的工作(无未保存改动)

最新 commit `f9c10c2`,`git status` 干净。本轮共修 **2 个真 bug**:

1. **`occ_ticker` 不剥标点**(`c0ddec3`)— OCC 期权根符号要去标点(`BRK.B` → `O:BRKB…`),
   否则每个请求 404、静默回填 0 天。已修 + 单测。
2. **回填脚本无 429 重试**(`0ac7675`)— 该脚本是**旁路**,不走主采集器的
   `provider_rate_limits` 共享限速闸门。"付费档无限调用"仅指无月度配额,**每秒限速仍在**;
   6 路并行 20 秒崩 2 个 worker,且 429 从 `underlying_closes`(逐日 try/except 之外)抛出会
   **杀掉整个标的**。已加指数退避重试 + 单测,改用保守 3 路并行。

另:135 个标的曾被 watchlist"替换式编辑"静默覆盖(含全套 16 个 SPDR 板块 ETF —— R1.3 板块
轮动的 `SECTOR_ETFS` 硬编码依赖),已全部恢复,现 watchlist **292 个**(TPS 已退市移除)。

collector 测试 **277/277**。
