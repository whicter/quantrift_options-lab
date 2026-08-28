# Tastytrade 认证锁死与告警静默

日期：2026-08-27
状态：**已解决 2026-08-28 —— 迁移到 OAuth2。见文末「续」。**

> 前半篇的诊断只对了一部分,保留原文不改,因为它记录了一条真实的推理弯路:
> 「一次性轮换的 token 丢了」有证据支持,但不是根因。根因是供应商下线了整条
> 传统认证路径 —— 重新登录永远不会成功。

## 一句话

remember-token 是一次性轮换的,某次交换后新 token 没能落库,库里留下一个已作废的 token,
之后每次运行都拿它去换 —— 两天后账号被провider 判定「登录尝试过多」临时锁定。
而告警从头到尾都在正常触发,只是没有任何投递出口。

## 一、时间线

| 时间 | 事件 |
| --- | --- |
| 2026-08-25 20:30 UTC | 最后一次成功交换,`provider_auth_state` 写入 token `12621ab377a3` |
| 2026-08-26 13:30 PT | cron 跑 `collect.py`,401 `invalid_credentials`,写入 0 行 |
| 2026-08-27 13:30 PT | 同样失败。待采集标的从 83 涨到 291(`TT_READY_REFRESH_DAYS=7` 的滚雪球) |
| 2026-08-27 19:53 PT | 修复后首次验证运行,provider 回 **「temporarily locked for 15 minutes due to excessive failed attempts」** |
| 2026-08-27 19:56 PT | 断路器手动打开,停止一切凭证发送 |

## 二、轮换是实锤,不是推测

`logs/collect.log` 里 30 次交换出现 **29 个不同指纹**,唯一重复的就是那个死掉的
`12621ab377a3`。也就是说 Tastytrade 每换一次 session 就作废旧 token 并下发新的,
而一旦某次的新 token 没保住,后续每次都在重发同一个尸体。

```
$ grep -o 'fingerprint=[0-9a-f]*' logs/collect.log | sort | uniq -c | sort -rn | head -2
   2 fingerprint=12621ab377a3
   1 fingerprint=f9c22f486c23
```

## 三、三个缺陷,按严重度排列

### 缺陷一:告警有铃没有线(最严重)

`auth.py::send_alert_email` 检查 `SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL`,
四个变量在 `.env` 里**都存在但都是空字符串**,于是每次都走 fallback —— 一行
`print` 进 `logs/collect.log`。故障从 8/26 起每次运行都正确报警,连续两天,没有一次被看见。

> **一个只写日志文件的告警不是告警。** 这条比 token 本身重要:token 会坏是常态,
> 坏了没人知道才是事故。

**已修**:接到 `operator_alerts.send_operator_alert`,新增 Telegram 通道,复用
`quantrift_index_future` 已在用的 bot 与 chat(`TG_TOKEN`/`TG_CHAT_ID` 写入
`collector/.env`)。实测投递成功。

### 缺陷二:崩溃窗口会同时毁掉新旧两个 token

原顺序是「交换 → 写库 → (仅当没有库连接时) 写 .env」。交换返回 201 的那一刻旧
token 已经作废,新 token 只存在于响应体里。这之后写库若失败,新旧全丢,只能人工重登。

**已修**:改成 **先写 .env,再写库**。本地文件写入不会因网络原因失败,数据库会。
并新增 `_recover_from_env_seed`:库里的 token 被拒时,若 .env 里是另一个值就试一次。
两个存储只会因为「.env 写成功、库写失败」而分叉,此时库里的才是死的那个。

这**推翻了**原有的 `test_rejected_database_token_does_not_consume_a_distinct_configured_seed`。
旧规则把 .env 当成不可消耗的引导种子来保护,在 .env 只存手工初值时是对的 ——
但正是它让这次故障只能靠人解。前提变了:.env 现在是每次轮换的写前镜像。

### 缺陷三:失败会无限重试,代价是账号

一个作废的 token 重试多少次都不会活,但 cron 和 daemon 每个周期都在发。
这些在券商那边累积成失败登录尝试,最终触发锁定。

> **这一条是我自己的改动放大的**:缺陷二的恢复路径把每轮尝试从 1 次变成 2 次,
> 叠加当天的排障探测,直接把账号打到锁定。原测试担心的正是这个,我推翻它时低估了。

**已修**:`provider_auth_state` 新增 `locked_out_at` / `locked_out_reason`。
两个种子都被拒时打开断路器,之后任何进程在**发出请求之前**就退出。
只有 `auth.py --login` 能清除它,且清除与写入可用 token 在同一事务里 ——
断路器的存在理由就是凭证在被消耗,那么解除它必须与「已提供可用凭证」不可分割。

实测:断路器打开后 `get_session_token()` 对 Tastytrade 的出站请求数为 **0**,
唯一的 POST 是告警本身。

## 四、恢复步骤

1. **先等 15 分钟以上**,让 provider 的锁定过期。期间不要运行任何会碰 Tastytrade
   的东西(断路器已经挡住了,但别手动绕过)。
2. ```
   cd collector && PYTHONPATH=$PWD ./venv311/bin/python auth.py --login
   ```
   `TT_LOGIN` 和 `TT_PASSWORD` 已在 `.env`,向导只会问 OTP(可能先问安全问题)。
   这一步会同时写入新 token 并清除断路器。
3. 补数据:`PYTHONPATH=$PWD ./venv311/bin/python collect.py`
4. 核对财报日历:`iv_history` 的 `max(date)` 应回到当日,
   且 ESTC/MDB/SNOW 应有 `earnings_date`。

## 五、留下的账

- `TT_READY_REFRESH_DAYS=7` 意味着停摆越久待采集量越大(83 → 291)。补一次即可回落。
- 断路器只覆盖 Tastytrade。IB 与 Polygon 的凭证失效路径没有等价保护,
  目前也没有观察到同类失败,**未做**。
- Telegram 是目前唯一配置的出口。SMTP 的四个空变量保留原样(未删),
  配上就会自动多一条通道。

---

# 续:真实原因与 OAuth2 迁移(2026-08-28)

**上面第二、三节的诊断只对了一部分。** 补一次凭证不是修复,老的认证方式整个被下线了。

## 一个不用凭证的判别实验

```
不存在的账号 + 瞎编的密码  →  401 invalid_credentials
本账号     + 正确的密码    →  400 missing_request_token
```

不存在的账号走的是**先查凭证再拒绝**的经典路径;本账号过了凭证这一关,卡在后面。
**这证明密码是对的**,问题在凭证之后的环节。同时也排除了 IP 封禁(封禁不会回正常 401)。

供应商 OAuth 文档的原话闭合了这条链:

> all tastytrade API users must use Oauth2 access tokens when interacting with the tastytrade API

老的 session token 被他们描述成 "long-lived, unscoped session tokens (24 hours)",
15 分钟的 OAuth access token 就是拿来取代它的。账号被切到新策略的那一刻,
已有的 remember-token 被吊销(8/26 的 401),密码登录也多出了一个为**交互式人工登录**
设计的 request-token 环节 —— 一个每天 13:30 无人值守的 cron 永远满足不了它。

所以 8/27 那份文档里「等 15 分钟再重登」的建议是错的:重登多少次都不会成功。
断路器在这里意外地做对了事,它挡住的正是一条不可能成功的重试。

## 迁移内容

| 位置 | 改动 |
| --- | --- |
| `auth.py` | `get_access_token()` 走 `POST /oauth/token`,`grant_type=refresh_token` + `refresh_token` + `client_secret` 三个参数(文档明确,**不含 client_id**) |
| `auth.py` | `authorization_header()` —— **唯一**允许拼这个头的地方 |
| `collect.py` | 头改为**每批重新解析**,不再在批次循环外取一次 |
| `run_refresh_worker.py` | 同上。**这个调用点第一轮被漏掉了** |
| `providers/tastytrade_option_chain_provider.py` | OAuth 时短路,不进 `_login()` |
| `collector/.env` | 新增 `TT_OAUTH_CLIENT_SECRET` / `TT_OAUTH_REFRESH_TOKEN`;**删除 `TT_PASSWORD`** |

### 三个新方案自带的坑

**① access token 只有 15 分钟,旧 session token 有 24 小时。**
`run_collector_daemon.py` 跑几周,原来「进程启动取一次、缓存到死」的写法在新方案下
会在 15 分钟后对每个周期 401。现在按到期时间续,提前 60 秒。

**② `Bearer` 前缀。** 两个 scheme 不能互换,而且写错不会立刻炸 —— 要等手上那个
token 过期才暴露。所以拼头的逻辑收进一个函数,并有守卫。

**③ 漏掉的调用点。** `run_refresh_worker.py:1051` 直接调 `collect.get_session_token()`,
改前两处时漏了。它会走进断路器,让每个 metrics 任务失败,而旁边的 OAuth 路径工作正常
—— 表现得像供应商故障而不是我们的 bug。行为测试抓不到:那一行只有拿到真实 job row
和数据库才可达。因此加了**静态扫描**守卫(限定 `collect.py` 和 `run_refresh_worker.py`;
provider 的 `_login()` 本身就是 legacy 路径,改用行为测试证明 OAuth 分支会短路)。

## 验证

```
access token          200,valid 900s
/market-metrics       200,SPY / MDB / SNOW / ESTC 均返回
collect.py            289 行写入,5 个失败(BRK.B/FX/RE/SMS/TTM,与 8/25 同一批,非新增)
iv_history max(date)  2026-08-28
有未来财报日的标的    20 → 35
daemon 端到端         job 66282 (symbol_metrics_snapshot / ACAC) succeeded,写入当日行
测试                  503 通过;每条守卫都在未修复代码上验过会失败
```

财报日历恢复后的近期:

```
2026-09-01  DELL, MDB, PANW
2026-09-02  AVGO, SNOW, TGS
2026-09-03  LULU, PL
2026-09-08  GME, ORCL
```

## 断路器保持打开,这是故意的

`provider_auth_state.locked_out_at` 仍然是打开状态,reason 已改写为
「legacy 认证已被供应商下线,由 OAuth2 取代」。OAuth 路径不经过它,不受影响;
而任何回落到 legacy 的代码都应该立刻失败,因为那条路已经不存在了。

## 留下的账

- `manual_login()` / `--login` 向导现在是死代码,**未删除** —— 删它要连带动一批测试,
  且留着它不会被自动执行(断路器挡在前面)。下次碰 `auth.py` 时一并清掉。
- refresh token 按文档「永不过期」。若被吊销,`invalid_grant` 会被识别为不可重试,
  需要人在 my.tastytrade.com 重新 Create Grant。
- OAuth 应用位置(2026-08 的 UI):**my.tastytrade.com → Manage → My Profile → API
  → OAuth Applications 标签页 → 应用行右侧的 `···` → Create Grant**。
  文档里写的是 "Manage" 按钮,实际 UI 已换成三点菜单。
