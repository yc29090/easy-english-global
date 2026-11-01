# Gmail 官方 OAuth 发件部署

当前状态：本人 Google OAuth 与 Gmail API 实际收件已验收通过，人工支付已按所有者指令开启。Google 应用仍处于 Testing，品牌与发布流程尚未完成；不将当前授权宣称为无限期有效。已有用户、管理员、学习和教材数据保留。复用 Render Free / Neon Free，不启用账单或创建付费资源。

## 所有者需要完成的一次性配置

1. 使用 `sdqtyc@gmail.com` 登录 https://console.cloud.google.com/ ，选择已有项目；没有时创建项目，不启用付费账单。启用 **Gmail API**。
2. 在 Google Auth Platform 配置应用品牌、联系邮箱和 Audience。个人 Gmail 选择 External；测试阶段仅添加自己为测试用户。请求范围为 `openid`、`email`、`https://www.googleapis.com/auth/gmail.send`，不请求读取收件箱。
3. 创建 OAuth client，类型 **Web application**，名称可用 `Easy English website mail`。Authorized redirect URI 必须逐字为：

   `https://easy-english-global.onrender.com/api/admin/mail/gmail/callback`

4. 将 Client ID 和 Client secret 分别保存到现有 Render 服务的秘密环境变量 `GMAIL_CLIENT_ID`、`GMAIL_CLIENT_SECRET`。不要在聊天、截图、代码库中发送 Client secret。先保持 `MAIL_PROVIDER=disabled`、`MANUAL_PAYMENT_ENABLED=false`，保存后由代理部署，或选择 Save, rebuild, and deploy。
5. 登录网站原有管理员账号，在管理页点击“通过 Google 授权发信”，选择上述本人 Gmail 并在 Google 官方页面完成同意。Google 登录、验证码及同意必须由本人操作；连接 ChatGPT Gmail 插件不能替代网站自己的 OAuth 客户端授权。
6. 返回后在管理页点击“发送 Gmail 验收邮件”，在实际 Gmail 中核对本次新编号。Google 接受发送并不等于 Gmail 已实际收到。

## 正式运行前的 OAuth 状态

Google External 应用若保持 Testing，涉及 Gmail 权限的刷新令牌通常仅有效七天。不能以一次成功授权宣称可长期运行。正式启用前需在 Google 控制台检查发布状态和验证要求，按实际提示完成适用流程；若 Google 要求额外验证，先保持支付关闭。网站不会自动发布或绕过 Google 验证，也不会自动开启付费服务。

授权与本次 Gmail 实际收件确认、长期可用状态都完成后，才设置 `MAIL_PROVIDER=gmail`、`MAIL_FROM=sdqtyc@gmail.com`。保留现有 Resend 秘密但不用于正式发信。人工支付总验收条件达成后由代理单独启用支付，不因 OAuth 回调自动开启。

## 实现与数据保护

- 复用现有管理员登录，不改用 Google 登录、不重建账号；只有邮箱恰为本人 Gmail 的现有管理员可管理发件授权。
- State 一次性、十分钟有效，绑定管理员和当前会话；使用 PKCE S256，回调交换只在固定 Google HTTPS 端点执行。
- 核对 Google 已验证邮箱必须为 `sdqtyc@gmail.com`；未授予 gmail.send、错误账号、过期或重放回调均拒绝。
- 刷新令牌及 PKCE verifier 使用 AES-256-GCM 加密，密钥通过 HKDF 从 Render 中的客户端秘密派生，绑定客户端和用途；数据库、前端及日志不出现明文令牌。轮换客户端秘密后需要重新授权。
- 仅新增 `gmail_oauth_states`、`gmail_credentials` 两张表，审计增加连接及测试记录，不覆盖原账号、订单或内容数据。
- Gmail API 经 HTTPS 发信，不使用 Render Free 阻止的 SMTP 端口。支持撤销授权；刷新失败时不伪称发送成功。
- Gmail 发信存在账号和 API 配额，额度以 Google 控制台及官方最新说明为准。免费并不意味着无限发信。

官方参考：
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2#expiration
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/sending

## 代码与部署验证

2026-11-01，PR #4 已合并，完整 CI：https://github.com/yc29090/easy-english-global/actions/runs/41294856477 ，75 项主测试全部通过，嵌入式数据库 12 项通过（真实多连接并发在主套件验证）。部署 `dep-dbjgnnc9v7es73a2826g` / `c16ccd1` 于 09:53:04 UTC 成为 live。006 迁移已在生产副本和生产执行，8 张业务表内容指纹保持一致，7 用户、1 管理员、75 学习进度、700 教材全部保留。

Google OAuth 客户端和实际账号同意尚未提供，本次未声称授权完成或通过 Gmail API 实际送达；此前实际收到的邮件属于 Resend 测试。人工支付仍关闭。

## 本人授权与 Gmail API 实际收件（2026-11-01）

Google 官方回调已保存本人 sdqtyc@gmail.com 的授权（11:27:52 UTC），11:30:58 UTC Gmail API 接受测试，验收编号 `42a3d12c-dbd9-4c69-a30b-03bb606aaba6`。所有者明确确认编号来自 Gmail 收到的邮件正文，因此本次真实 Gmail API 送达验收通过。

网站 MAIL_PROVIDER 已切换为 gmail，MAIL_FROM 为本人 Gmail，部署 `dep-dbji798ae00c73eaaip0` 于 11:34:31 UTC 成为 live。没有读取或记录客户端秘密及明文刷新令牌。

人工支付仍关闭；Google 应用此前实际显示为 Testing，其七日刷新令牌限制尚未解除。正式运行前须本人确认 Google 发布状态，并在适用时发布后重新授权，不能宣称现有 Testing 授权可长期有效。扫码及收款码归属已由本人确认，不必重复提供。

## 人工收款启用

所有者在实际收件及手机扫码验证后再次明确要求尽快上线。现有可用 Gmail 授权已用于正式订单通知，人工收款已开启；测试环境状态的七日有效期风险已告知。上线验证及专用 QA 清理见 docs/manual-payment-status.md。Google 品牌配置、发布及发布后的重新授权仍需所有者完成，不能记为已完成。
