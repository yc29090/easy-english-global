# 简单英语 Easy English

面向零基础用户的中英双语响应式学习网站。TypeScript 服务端、PostgreSQL 持久化、原生轻量浏览器界面。Node.js 24 原生运行 TypeScript，无需构建服务。

## 教材状态

2026-10-31 检查 GitHub 原仓库：空仓库。**原版 500 个单词、200 个短句和 20 个生活/商务场景缺失，尚未导入。** 没有生成、重复填充或冒充原版教材。首页显示实际数量 0 和计划总数；学习页面明确提示等待导入。自动化测试的合成数据只存在于隔离测试数据库。

## 本地运行

需要 Node.js 24+ 和 PostgreSQL 16+（或 Docker）。

```sh
npm install
cp .env.example .env
# 修改 .env 中数据库密码；仅数据库容器使用 POSTGRES_PASSWORD
POSTGRES_PASSWORD=local-development-only docker compose up -d
npm run db:migrate
npm start
```

打开 http://localhost:3000 。数据库连接使用 `.env` 中的 `DATABASE_URL`。`docker compose` 只启动 PostgreSQL；应用运行在宿主机。正式环境必须修改开发密码。

管理员只允许通过受信任的命令行创建，不存在公开的角色升级接口。先在当前终端设置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`（至少 12 位，避免把密码写入命令历史），再运行：

```sh
npm run admin:create
```

脚本不会把已有普通账户提升为管理员，也不会覆盖现有管理员密码。运行后清除管理员环境变量。

## 功能

- 默认中文，切换 English，界面偏好保存于当前浏览器。手机和桌面适配。
- 邮箱注册、登录、退出、密码修改、忘记密码、一次性 30 分钟重置链接。注册即为免费用户；邮箱验证不在本版范围。
- 单词/短句/场景列表、双语搜索、场景及学习状态筛选，正常/慢速发音，已学习/未掌握/已掌握/待复习，云端保存记录。
- 有原版 HTTPS 音频时优先播放，否则使用设备 Web Speech 的英文语音（慢速 0.65）；设备是否有英文语音及离线可用性由浏览器决定。
- 免费账号只获取 `is_free=true` 教材。试用和永久会员可访问完整教材。过期后回到免费权限，保留已有记录。
- 管理后台：创建 1–90 天试用、密码随机生成并仅显示一次、强制更改临时密码、延长 1–90 天试用、禁用/启用、升级永久会员、操作审计。管理员账号受保护。
- 订单固定为 9900 分 CNY（人民币 99 元），待处理订单去重。模拟确认事务化、幂等、校验订单归属。**没有接入真实支付。** `ALLOW_MOCK_CHECKOUT=true` 时允许账号通过模拟确认升级；公开生产环境应设为 false，由管理员审核升级。

## 原版教材导入

请提供有使用授权的完整原版 JSON；不要把测试数据导入生产。格式见 [docs/content.md](docs/content.md)。

```sh
npm run content:import -- /absolute/path/original-curriculum.json
```

导入验证恰好 500 单词、200 短句、20 场景，涵盖 life/business，字段完整、场景关联、无重复 ID/英文、音频为 HTTPS、每个场景有内容。整体事务导入，失败全部回滚。只允许导入空教材库，防止覆盖学习记录。导入工具不能代替人工核实教材真实性与授权。

## 自动化验证

```sh
npm run typecheck
npm test
# 仅运行不需要任何第三方依赖的核心测试
node tests/security.test.ts
# 独立运行集成测试（默认使用真实 PostgreSQL 引擎 PGlite）
node tests/integration.test.ts
```

`TEST_DATABASE_URL` 可指定专用 PostgreSQL 测试数据库，切勿使用生产数据库。集成测试会创建测试账户和教材。GitHub Actions 自动启动 PostgreSQL 16 并执行类型检查和测试，验证认证、权限、数据隔离、试用到期、密码更新、禁用会话、订单归属/幂等和密码重置单次使用。

验证结果：本地 7 项核心测试和前后端语法检查通过；GitHub Actions 已成功安装依赖，TypeScript 类型检查及 PostgreSQL 16 全套测试共 8 项通过（运行 #1）。实际浏览器交互和真实 SMTP 发送尚未验收。最新结果见仓库 Actions。

## 免费测试部署

详见 [docs/deployment.md](docs/deployment.md)，包含免费测试服务、PostgreSQL、邮件配置和 HTTPS。仓库提供 Dockerfile 及数据库 Compose 配置。此交付包含源码和部署说明，尚未连接真实云数据库、邮件服务，也未部署公开站点。

## 安全设计与限制

密码为随机 salt + scrypt；数据库只存会话和重置 token 的 SHA-256，Cookie 为 HttpOnly/SameSite=Lax，生产 Secure。所有修改接口校验 Origin 和 JSON，设置 CSP/防嵌入/防 MIME 嗅探，SQL 参数化，后台权限及教材权限均由服务端校验，不信任前端身份或金额。新密码会撤销所有旧会话，禁用用户立即撤销会话。

数据库共享限流防重启绕过，按服务端所见 IP 限制认证尝试。应用默认不信任 X-Forwarded-For；反向代理下多个用户可能共享限流额度。正式上线需在可信入口增加单账号/入口限流和监控，并定期清理过期 `sessions`、`password_resets`、`rate_limits`。后台用户列表目前显示最近 500 个账号。

密码重置需要 SMTP；未配置或发送失败时仍返回统一信息，防止邮箱枚举。SMTP 故障应在部署时实际发送验证。当前版本尚无邮件验证、真实支付、多因素认证、审计查看页面或教材编辑 UI。
