# Render 全球公开免费测试部署

当前公开测试站已部署：[https://easy-english-global.onrender.com](https://easy-english-global.onrender.com)。Render 服务为 Free，Neon 项目套餐为 free_v3，使用 PostgreSQL 18。服务通过连接器按 render.yaml 的运行参数创建，并非已建立 Blueprint；自动部署关闭，避免未验证的提交自动发布。费用、免费额度和到期政策仍以平台为准。

数据库已执行仓库三份迁移并导入全套教材，重复执行已验证安全。生产启动的实际 TLS 会话验证已通过，日志为 `Database TLS verified: TLSv1.3`。真实公网 Smoke 14 项、扩展功能验收 19 项通过，结果见 [部署状态](../deployments/public-test.json)。管理员本人初始化与手机实机验收尚未完成。

## 1. 服务类型与连接仓库

选择 **Web Service → Node**，不要选择 Static Site：本项目包含登录、服务器权限和 PostgreSQL 写入。选择 Free 实例。服务器监听 `0.0.0.0`，端口使用 Render 提供的 `PORT`。

可用以下任一方式：

- Render → New → Blueprint → 连接 GitHub → 授权访问 `yc29090/easy-english-global` → 分支 `main` → 使用仓库根目录 `render.yaml`，在 Render 表单安全填写 DATABASE_URL；测试阶段邮件默认关闭，不需要邮件密钥。
- Render → New → Web Service → Git Provider → 选择上述仓库及 `main`，手工填写下表命令与环境变量。Root Directory 留空。

配置如下：

| 项目 | 值 |
|---|---|
| Runtime | Node |
| Plan | Free（确认创建页面未切换为付费） |
| Node | 24.22.1（`.node-version` 和 `NODE_VERSION` 已指定） |
| Build Command | `npm install --omit=dev && npm run content:validate` |
| Start Command | `npm run start:render` |
| Health Check Path | `/health` |
| 分支 | `main` |
| 自动部署 | CI 检查通过后部署（Blueprint 的 `checksPass`） |

选择与数据库靠近的地区，降低初次导入延迟。免费 Web Service 可能休眠和冷启动；服务可通过 HTTPS 被全球用户访问，但不是多地区部署。仓库不设置 `preDeployCommand`，不依赖付费 Shell、后台 Worker 或持久磁盘。构建不访问数据库，秘密不进入构建输出或 Git。

## 2. 创建 PostgreSQL

推荐免费测试组合：Render Free Web Service + Neon 免费 PostgreSQL。

1. 在 Neon 创建项目和 PostgreSQL 数据库，选择靠近 Render 服务的地区。
2. 使用随机生成的数据库角色密码，不使用示例密码或管理员网站密码。
3. 复制标准 PostgreSQL 连接字符串（可以使用 pooled connection），放入 Render 的 **Environment → DATABASE_URL**。不要贴到 GitHub 文件、Issue、截图或日志。
4. 设置 `DATABASE_SSL=verify-full`。应用强制生产 TLS 并验证证书；即使连接串里是 `sslmode=require`，也不会关闭证书验证。

也可以在 Render → New → PostgreSQL 创建数据库。只有控制台明确提供免费选项时才选择 Free；确认到期、备份及恢复政策。免费 Render PostgreSQL 可能有期限，不适合当作永久免费数据库。把它的 PostgreSQL URL 配到 `DATABASE_URL`；优先采用可验证证书的 External URL。若使用 Internal URL，必须实际确认 TLS 证书与主机名可验证，不要通过关闭校验解决问题。

`render.yaml` 不会自动创建数据库，避免无意开通付费实例。不要把 PostgreSQL 装进 Web Service 容器：免费服务磁盘不是数据库存储方案。

## 3. 环境变量

仅在 Render Environment 填真实值，不修改 GitHub 中的 `.env.example`。

| 变量 | 公开测试配置 | 是否需要手填 |
|---|---|---|
| `NODE_ENV` | `production` | Blueprint 已配置 |
| `NODE_VERSION` | `24.22.1` | Blueprint 已配置 |
| `DATABASE_URL` | 自己的 PostgreSQL 连接字符串，包含独立角色及随机密码 | **必须，秘密** |
| `DATABASE_SSL` | `verify-full` | Blueprint 已配置 |
| `ALLOW_MOCK_CHECKOUT` | `false` | Blueprint 已配置；生产设 true 会拒绝启动 |
| `APP_URL` | 实际 HTTPS 网站根地址，无路径、查询或用户名密码 | Render 可不填，自动使用注入的 `RENDER_EXTERNAL_URL`；自定义域名时手填 |
| `PORT` | Render 自动提供 | 不手工固定 |
| `MAIL_PROVIDER` | 测试默认 `disabled`，启用邮件可改 `resend` | Blueprint 已配置为 disabled |
| `RESEND_API_KEY` | 邮件服务自己的真实 API key | 使用 resend 时**必须，秘密** |
| `MAIL_FROM` | 已验证的发信地址，如 `Easy English <你的发信地址>` | 启用邮件时**必须** |
| `DATABASE_CA_CERT` | 可选 PostgreSQL 私有 CA 的完整 PEM 文本 | 公共 CA 通常不需要；真实证书不要提交 Git |

本轮公开测试 Blueprint 已设置 `MAIL_PROVIDER=disabled`，此时无需 Resend key 和发信地址；前端会隐藏“忘记密码”，接口返回不可用，不能声称密码重置已测试。若需要完整注册登录与找回密码体验，应配置邮件。

免费 Render 服务对标准 SMTP 出站端口有限制；推荐使用 HTTPS 邮件 API。申请 Resend key 并验证自己的发信域名和地址；仅使用其默认测试发信地址时，收件人通常限于账号所有者，不能据此认为所有用户均可收到邮件。免费额度和发信规则以提供方为准。

如果运行环境允许 SMTP，可改用 `MAIL_PROVIDER=smtp`，并填写 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 和 `MAIL_FROM`。465 使用 TLS，其他端口要求 STARTTLS。不要在免费 Render 上假设 25/465/587 都可访问。

**不要**在 Web Service 中配置 `ADMIN_EMAIL`、`ADMIN_PASSWORD`、`SMOKE_PASSWORD`，也不要配置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。站点没有默认管理员或默认管理员密码，不需要凭空添加 `SESSION_SECRET`：会话使用随机不透明 token，数据库只存哈希。

## 4. 数据库迁移和教材导入

`npm run start:render` 在开始监听前执行：

1. 校验生产配置；
2. 执行编号迁移（事务 + advisory lock，已执行的迁移跳过）；
3. 安装 500 单词、200 短句、20 场景、100 对话（406 句台词）；
4. 已安装且版本哈希、ID 数量完整时快速跳过，避免每次冷启动逐条扫描；
5. 启动 HTTP 服务。

首次准备可能较慢。在 Render Events/Logs 中等待启动完成；`/health` 只在数据库可访问、迁移版本与教材安装标记正确时返回 `200 {"ok":true}`，缺少准备或数据库故障返回 503，不泄露连接信息。导入有冲突时停止启动，不会删库“恢复”。

可以从受信任电脑手工执行；不需要 Render Shell。先安装 Node.js 24，克隆 `main`，运行 `npm install --omit=dev`，通过隐藏输入把 **External DATABASE_URL** 放入当前终端环境（Bash 示例）：

```sh
set +x
read -rsp 'PostgreSQL URL: ' DATABASE_URL
echo
export DATABASE_URL
export NODE_ENV=production
export DATABASE_SSL=verify-full
npm run db:migrate
npm run content:validate
npm run content:import
unset DATABASE_URL
```

上述三条命令可以安全重复执行。迁移不会重置已执行记录；手工导入会检查全部行，只新增缺失教材，相同版本零新增，冲突全部回滚。用户、学习记录、复习时间、陪练位置、试用、会员和订单均不清空。首次上线前和每次升级前都应有数据库备份。

## 5. 第一个管理员：安卓 Termux 或可信电脑隐藏输入

请按 [安卓手机分步说明](admin-android.md) 操作。无需 Render Shell、付费资源或公开初始化网页。先在本地安装 Node.js 24、克隆仓库并安装生产依赖，然后执行：

```sh
npm run admin:create
```

四项输入依次为：数据库连接字符串、管理员邮箱、密码、确认密码。所有输入隐藏，数据库连接和管理员密码只保存在当前进程内存，强制 TLS 证书验证。不要把任何真实值放在命令后面、环境变量、`.env`、GitHub、聊天或日志中。旧的 ADMIN_EMAIL/ADMIN_PASSWORD 环境入口已经移除，此命令也不读取 DATABASE_URL 环境变量。

现有初始化的事务、数据库锁、随机盐 scrypt、首个管理员检查及审计保持不变。密码 16–128 位、至少三类字符，拒绝默认密码。已有同邮箱普通账号不会被提升或覆盖；管理员已存在时初始化关闭。没有任何网页管理员创建接口。

成功后由所有者在网站亲自登录检查管理后台，再通过专用试用账号验证期限、延期、禁用和权限隔离。助手不接收管理员密码，不代替所有者输入，不创建额外管理员用于验收。

## 6. 部署后的自动基本检查

取得真实 Render URL 后，在受信任电脑运行：

```sh
npm run smoke -- https://你的实际服务.onrender.com
```

默认检查健康、首页、静态资源、安全响应头、教材总数、免费权限、管理员接口拒绝匿名访问、禁止跨源写入、禁止下载 `.env` 和原始教材文件、模拟支付能力关闭。默认不注册账号、不写学习记录。失败时退出码为 1；冷启动的单次请求最长等候 60 秒。

可通过隐藏输入临时设置 `SMOKE_EMAIL` / `SMOKE_PASSWORD`（专用普通测试账号），再运行同一命令，额外检查登录、Cookie 标记、云端记录读取及已登录状态下禁止下单，最后撤销此次创建的会话。不会改动该账号的学习记录。用完 `unset SMOKE_EMAIL SMOKE_PASSWORD`。不要使用真实学员密码做自动验收。

自动检查不能代替以下人工验收：

- 新用户注册、登录；换设备后检查学习、复习及场景陪练进度。
- 管理员试用创建、临时密码首次修改、延期、禁用、会员授权。
- 安卓和 iPhone 的正常/慢速发音、隐藏文字、重复跟读及窄屏布局。
- 实际收取密码重置邮件，重置后旧会话失效、链接不能重复使用。
- 确认会员页无模拟支付按钮，手工伪造模拟确认也被拒绝。

CI 中已通过 32 项测试，并用隔离数据库和本地 HTTP 服务器执行同一基本检查；移除开发依赖后，两次实际启动也均通过基本检查，但**没有真实 Render URL 时不能当作线上检查通过**。

## 7. 运维与故障处理

构建不需要数据库，启动需要。启动失败时先核对必需变量、HTTPS APP_URL、PostgreSQL TLS/连通性和教材版本冲突；可在受信任电脑配置同样变量后运行 `npm run config:check`（只验证格式，不测试实际网络或凭证授权，不打印秘密）。

原 `.env.example` 是本地配置，不能直接照搬到生产。任何凭证泄漏都需要撤销并轮换，不能只删除文件。不要清空数据库或降低证书验证来绕过启动失败。域名变更时同步更新 APP_URL，否则跨源写入保护会拒绝登录等请求。

迁移或首装后若健康检查持续失败，应查看 Render 日志并核对数据库安装状态。保留数据库备份，免费数据库的到期和备份策略需单独确认。限流默认不信任客户端转发 IP，反向代理后的用户可能共享认证额度；公开扩大测试前应配置可信入口限流。

可由受信任维护任务定期清理过期数据：

```sql
DELETE FROM sessions WHERE expires_at < now();
DELETE FROM password_resets WHERE expires_at < now();
DELETE FROM rate_limits WHERE expires_at < now();
```

平台参考：[Render 免费服务](https://render.com/docs/free)、[Blueprint 配置](https://render.com/docs/blueprint-spec)、[Node 版本](https://render.com/docs/node-version)、[PostgreSQL](https://render.com/docs/postgresql)。

## 当前部署限制与后续验收

- 当前连接器可创建 Free Web Service，但不能直接创建 Blueprint，也不提供 HTTP 健康检查路径的修改操作。平台当前使用 TCP 探针；请在服务 Dashboard → Settings → Health Check Path 填 `/health`。这不改变套餐，不应选择升级实例。
- 初始生产管理员数为 0，没有默认密码。按本文第 5 节在可信终端初始化；不要在聊天中提供密码，也不要把密码放入 Render 常驻环境。生产环境已验证普通用户不能访问管理员接口，管理员正向操作另有隔离 CI 覆盖，所有者初始化后仍需实际验收。
- 公网验收工作流 `live-acceptance.yml` 需要部署负责人配合数据库控制，仅操作当前 GitHub run ID 对应的 `ee-live-<run>-a/b@example.invalid` 专用账号。先完成免费权限检查，再只为 B 账号开启试用；待 B 的付费教材及陪练记录保存后，将它的试用时间设为过去，验证到期限制。结束后禁用两个 QA 账号并过期它们的会话，保留记录；不要触碰真实用户。该流程不会创建管理员或输出测试密码。
- `live-smoke.yml` 对真实公网地址执行无凭证 Smoke，发布状态文件变更时自动运行，也可手工触发。它不依赖终端的网络代理，不把本地 mock 结果冒充线上结果。
- 安卓/iPhone 实机浏览器布局与英语语音质量尚未验收，不能由 HTTP 或 DOM 单测替代。
