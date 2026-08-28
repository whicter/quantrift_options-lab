# Tastytrade 认证锁死与告警静默

日期：2026-08-27
状态：**已修代码，等待人工重新登录；断路器已打开**

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
