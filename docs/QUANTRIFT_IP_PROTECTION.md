# Quantrift 知识产权与商业化保护方案

## 1. 文档目的

本文记录 Quantrift 在产品商业化前后保护代码、算法、品牌、数据和运营资产的执行方案。

这不是法律意见。商标、版权、专利、合同和数据许可应在需要提交或签约时由目标市场的律师复核。

## 2. 当前结论

产品名称和 repository 名称相同，本身不会造成主要风险。真正的风险来自：

- repository 或部署产物公开；
- 核心算法被编译进浏览器端 JavaScript；
- API 可以被批量调用并复制结果或数据；
- secrets 出现在 Git 历史、日志、截图或构建产物；
- 没有保留作者、版本、发布时间和部署证据；
- 员工、承包商或供应商没有签署保密和知识产权转让文件。

当前已完成：

- GitHub repository 已设置为 `Private`。
- 产品使用 `Quantrift` 名称和 `quantrift.io` 域名。

Private repository 是必要条件，但不是完整保护方案。浏览器中的内容始终可能被用户查看，因此核心算法必须由后端执行。

## 3. 资产分类

### 3.1 应作为商业秘密保护的资产

以下内容不应公开或由前端直接暴露：

- Scanner 候选生成、过滤、排序和评分算法；
- GEX、Gamma Flip、Call Wall、Put Wall、Local Gamma 的计算和数据清洗逻辑；
- 策略匹配、腿组合生成、POP 和收益风险计算；
- DTE、Delta、OI、Volume、spread width 等参数的默认值和权重；
- 数据源选择、fallback、质量评分、stale 判断和恢复逻辑；
- 用户行为、订阅权限、限流和批量访问规则；
- 历史 option snapshot、衍生指标、回测结果和校准数据；
- 尚未公开的产品路线、定价、客户名单和运营指标。

### 3.2 应作为版权资产管理的内容

- 后端和前端源代码；
- 原创 UI 设计、图标、文案和视觉素材；
- `docs/` 中的原创算法说明、学习材料和 Wiki；
- 数据库 schema、迁移文件和原创数据库结构；
- 用户手册、帮助说明和营销页面。

### 3.3 应作为商标资产管理的内容

- `Quantrift` 文字标识；
- Quantrift logo；
- 产品页面、域名、社交账号和应用名称的一致使用。

## 4. 现在立即执行

### 4.1 Repository 和 GitHub

- 保持 repository 为 `Private`，不要为了展示产品而公开源代码。
- 开启 GitHub 2FA 或 passkey。
- 开启 secret scanning、push protection、Dependabot alerts。
- 保护 `main` 分支：禁止直接 push，要求 PR、CI 和至少一次 review。
- 使用 GitHub Organization 管理成员和权限；成员使用最低必要权限。
- 不把 `.env`、TT remember token、IB 凭证、数据库 URL、云平台 token 写入 Git。
- 定期检查当前文件和完整 Git 历史中的 secrets。
- 生产发布使用 commit SHA，保留部署记录，不使用无法追溯的本地构建。

如果 repository 曾经公开过，应假设历史代码已经被复制：

1. 立即轮换曾出现在历史中的所有 credentials。
2. 检查 Git 历史、GitHub forks、发布包和构建产物。
3. 保存最早 commit、发布时间和部署日志作为权属证据。
4. 不把“改成 private”视为已经收回复制内容。

### 4.2 部署和 API

- Railway、Vercel 继续从 private repository 部署，不需要公开 repository。
- 所有 TT、IB、数据库和 provider credentials 只放在服务端 secret variables。
- 前端不得读取数据库、数据源凭证或内部 provider 路由。
- 生产构建不公开 source map；若必须保留，上传到受限错误监控服务。
- 后端只返回展示所需的结果模型，不默认返回全量原始 option chain、内部评分因子或权重。
- 对 analyze、scan、weekly 和批量查询接口增加认证、速率限制、分页和请求配额。
- 限制单次 symbols 数、历史日期范围、option chain 深度和导出量。
- 记录 API 调用、用户、IP、请求量、错误率和异常 symbol 枚举行为。
- PostgreSQL 只允许必要的服务访问；不要为方便调试而长期开放数据库公网访问。

### 4.3 代码和数据证据

每个生产版本保存：

- commit SHA；
- 构建时间和部署时间；
- 版本号；
- 数据库 migration 版本；
- 算法配置版本；
- 测试结果；
- 发布说明；
- 关键页面和 API 响应的归档快照。

这些记录用于证明版本先后、作者关系和产品持续开发过程。

## 5. 商业化前执行

### 5.1 商标

在目标市场正式商业化前：

1. 搜索 USPTO、目标国家商标库、Google、App Store、GitHub、社交平台和域名中的相同或近似名称。
2. 由律师确认 `QUANTRIFT` 的可注册性和适用商品/服务类别。
3. 优先申请文字商标，再决定是否申请 logo 图形商标。
4. 保留常见拼写域名和官方社交账号。
5. 注册完成前使用 `Quantrift™`，获批后再使用 `Quantrift®`。

商标保护的是识别产品来源的名称、短语或图形，不保护算法本身。参考：[USPTO Trademark Basics](https://www.uspto.gov/trademarks/basics)。

### 5.2 版权

代码和原创内容固定后通常即产生版权，但在美国，及时登记能增强执法和赔偿能力。商业化前评估登记：

- 主要后端代码；
- 主要前端代码；
- UI 和视觉资产；
- 文档、教程和原创数据库内容；
- 重大版本更新。

参考：[U.S. Copyright Office Registration](https://copyright.gov/registration/)、[Computer Programs Circular 61](https://www.copyright.gov/circs/circ61.pdf)。

版权保护具体代码和作品表达，不保护“做一个期权 scanner”这个抽象想法。

### 5.3 商业秘密制度

在商业化前建立内部制度：

- 标注 `Confidential` 的算法、数据和运营文档；
- 将公开产品说明与内部实现文档分开；
- 限制核心算法、数据和生产日志访问；
- 为成员、员工和承包商配置单独账号；
- 保留访问日志和权限变更记录；
- 离职时撤销账号、收回设备、删除访问权限并确认资料返还/删除；
- 禁止将项目代码复制到个人 repository、个人网盘或其他客户项目；
- 对外演示只展示必要结果，不展示内部权重、源代码和完整数据链路。

只有采取实际保密措施，未公开算法和数据才适合主张为商业秘密。

### 5.4 合同

所有非本人参与者在获得 repository 或生产数据访问前，应签署并由律师审核：

- NDA；
- Invention Assignment；
- Work Product / IP Assignment；
- 保密信息定义和例外；
- 离职后的资料返还与删除义务；
- 禁止转售、抓取、逆向和共享账号的条款；
- 第三方依赖和数据源合规责任。

## 6. 产品架构保护边界

### 6.1 后端保留

后端必须保留：

- 数据源 adapter 和 provider fallback；
- raw snapshot 到 normalized snapshot 的转换；
- GEX、walls、gamma flip 和策略候选计算；
- 评分、阈值、排序和质量判断；
- 付费功能权限和批量访问限制。

### 6.2 前端只展示

前端可以展示：

- 标的、策略名称和具体合约腿；
- 经过解释的分数、风险和数据时间；
- 用户需要理解的指标定义和状态；
- 经过权限检查的图表和摘要。

前端不应包含：

- 全套算法源码；
- 隐藏的评分权重；
- provider credentials；
- 数据库 schema 或 SQL；
- 内部调试 trace；
- 可直接重建完整数据库的批量接口。

需要注意：前端无法真正隐藏任何发送给浏览器的数据。混淆和压缩只能增加阅读成本，不能替代后端隔离。

## 7. 商业化后持续控制

每月：

- 检查 GitHub members、deploy tokens、Railway/Vercel access 和数据库账号；
- 检查 secret scanning、依赖漏洞和异常 API 调用；
- 检查 source map、debug endpoint 和错误响应是否泄漏内部信息；
- 检查是否出现仿冒域名、仿冒账号或相同产品名称。

每季度：

- 审计生产数据访问；
- 轮换非长期凭证；
- 演练账号泄漏、provider token泄漏和数据库备份泄漏；
- 复核 NDA、IP Assignment、Terms 和 Privacy Policy；
- 评估是否需要版权登记更新、商标扩展或专利意见。

每次重大版本发布：

- 生成版本归档和 commit 证明；
- 更新版权和版本声明；
- 记录新增算法、数据模型和原创 UI 资产；
- 确认新依赖和数据源的许可允许当前使用方式。

## 8. 泄漏或抄袭响应流程

### 8.1 凭证泄漏

1. 立即禁用或轮换泄漏凭证。
2. 暂停受影响的 worker 或 endpoint，避免继续扩大影响。
3. 检查访问日志、数据库操作和异常 API 调用。
4. 确定影响范围和时间窗口。
5. 保存原始证据，不覆盖日志。
6. 修复泄漏路径并增加回归测试。

### 8.2 代码或内容抄袭

1. 保存对方 URL、页面截图、响应、时间戳和网页归档。
2. 对比 commit、发布记录、源代码片段和原创文案。
3. 区分相似想法、相似功能和可证明的复制行为。
4. 通过 hosting provider、GitHub 或域名注册商的正式流程提交投诉。
5. 涉及商业损失时交给知识产权律师处理，不直接公开争执或泄漏更多内部资料。

### 8.3 品牌仿冒

保存域名注册、商标申请、最早使用记录、产品页面和付款记录，并由律师处理 cease-and-desist、平台投诉或商标争议。

## 9. 不采用的低价值措施

以下措施不能作为主要保护手段：

- 仅把 repository 改成随机名称；
- 仅做 JavaScript 混淆；
- 隐藏 API URL；
- 禁止右键；
- 删除页面上的版权声明；
- 只写一份 NDA，但不做权限控制和审计；
- 公开完整算法后再试图把它当商业秘密。

## 10. 完成标准

### 当前阶段完成

- [x] repository 为 private。
- [ ] GitHub 2FA/passkey 和 branch protection 已确认。
- [ ] secret scanning、push protection 和依赖告警已确认。
- [ ] 历史提交 secrets 审计完成。
- [ ] production source maps 和 debug endpoint 检查完成。
- [ ] 核心算法确认只在后端执行。
- [ ] API 限流、认证、分页和批量访问上限已记录并测试。

### 商业化前完成

- [ ] Quantrift 商标检索完成。
- [ ] 目标市场商标申请方案由律师确认。
- [ ] 代码、UI、文档版权登记方案确定。
- [ ] NDA 和 IP Assignment 生效。
- [ ] Terms of Service 和 Privacy Policy 生效。
- [ ] 商业秘密文档分级和权限审计完成。
- [ ] 生产版本证据归档流程稳定运行。

### 商业化后持续完成

- [ ] 每月安全和权限审计。
- [ ] 每季度凭证、数据访问和供应商审计。
- [ ] 泄漏和抄袭响应演练完成。
- [ ] 重大版本完成权属和许可复核。

## 11. 官方参考

- [GitHub Security Features](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [USPTO Trademark Basics](https://www.uspto.gov/trademarks/basics)
- [USPTO Patent Essentials](https://www.uspto.gov/patents/basics/essentials)
- [U.S. Copyright Office Registration](https://copyright.gov/registration/)
- [U.S. Copyright Office: What Is Copyright?](https://www.copyright.gov/what-is-copyright/)
- [Copyright Registration of Computer Programs, Circular 61](https://www.copyright.gov/circs/circ61.pdf)

