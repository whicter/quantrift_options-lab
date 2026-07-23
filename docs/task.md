# Quantrift Options Lab — Task Tracker

> 本文件是任务状态事实源。历史实现细节见 `ARCHITECTURE.md`、`wiki.md` 与 Git 历史。

## ✅ 已完成的主要能力

- [x] React/Vite 教育工具、策略库、Payoff 与 Greeks。
- [x] Railway PostgreSQL、Express API、Vercel 前端。
- [x] Polygon 日线/30m、期权快照、GEX、OI Delta 与派生波动率数据链。
- [x] Snapshot cache、scanner materialization、refresh queue、worker、provider budget 与状态监控。
- [x] Analyze 真实 S/R、Focus Score、Composite Momentum、GEX、OI density、IV skew 与 term structure。
- [x] Market Regime、真实 Weekly Recap、Scanner candidates、alerts、heartbeat。
- [x] Clerk/Portfolio/Stripe 代码与 schema scaffold；生产凭据和最终 enforcement 尚未启用。

## ✅ Analyze Technical Support Confluence（代码完成）

- [x] `GET /api/technical-levels/:symbol` 使用真实 PostgreSQL 快照，不同步调用 provider。
- [x] 50/100/200DMA、ATR14、日线 Pivot、周 MA4/12/20/40 与周线 Pivot。
- [x] 常规交易时段 30m Volume Profile POC/HVN 与 Anchored VWAP。
- [x] GEX Wall 和 7–60 DTE 最大 OI Wall 分开计算，缺失时 fail closed。
- [x] 先按 spot 分 support/resistance，再按 `max(0.5 × ATR14, 0.5% × spot)` 聚类。
- [x] Analyze 面板展示 S1–S3/R1–R3、强度、距离、证据、来源与期权状态。
- [x] 后端目标测试 8/8、前端目标测试 3/3、ESLint 与生产 build 通过。
- [x] GOOG 生产输入 smoke 完成；计算结果未被误写成生产部署完成。
- [x] 功能 commit：`da298f4`。

## 🚧 Analyze Technical Support Confluence（部署验收）

- [ ] Railway 部署并验收 `GET /api/technical-levels/SPY`。
- [ ] Vercel 部署并验收 `/analyze?symbol=SPY`。
- [ ] 确认 SPY 同时显示真实 Technical Levels 与旧版 4-Tab。
- [ ] 确认无 mock symbol 仍显示真实技术结构。
- [ ] 确认无 GEX/OI 时只显示 missing，不生成替代 Wall。
- [ ] 记录 Railway/Vercel deployment ID 与验收日期。

## 实施优先级（执行顺序）

1. 完成 Technical Levels 的 Railway/Vercel 生产部署与 SPY 验收。
2. 配置并验收 Clerk/Stripe 生产凭据，再决定是否启用 `AUTH_ENFORCEMENT_ENABLED`。
3. 完成 SMTP/VAPID、heartbeat webhook、Reddit OAuth、Unusual Whales stream 等外部凭据验收。
4. 完成 UPS 采购和 Mac Studio 受控断电/恢复演练。
5. 处理剩余 V1 polish 与非阻塞性能优化。

## 已知回归基线

- Technical Levels 专项：server 8/8、frontend 3/3。
- Frontend：ESLint 0 error，production build 成功。
- 当前工作区存在来自后续功能的未跟踪测试与源码；合并前不得把它们误判为 Technical Levels 回归。
- 全仓库测试数字以完成目录/分支同步后的 canonical 工作树重新执行结果为准。
