# 无域名发件测试

网站保持 MAIL_PROVIDER=disabled、MANUAL_PAYMENT_ENABLED=false。不会开放公共找回密码或人工支付。

所有者已明确授权发送一次测试邮件至其 Resend 注册邮箱 sdqtyc@gmail.com。使用 Resend 测试发件地址 onboarding@resend.dev，仅用于测试到该所有者邮箱，不表示获得面向任意用户的生产发件授权。

通过 Render 安全环境保存 RESEND_API_KEY；运维另外设置非秘密 UUIDv4 的 MAIL_ACCEPTANCE_TEST_ID，在下一次启动触发一次测试。仅固定所有者邮箱可收件，不提供公共 HTTP 发件端点。已有管理员必须有效，否则不发信。

发送请求使用 Idempotency-Key，服务商接受后记入现有 audit_log，后续启动跳过。邮件与会员、订单、教材、学习进度无关联，不重置密码。审计只增加验收记录；日志不打印凭据或服务商原始错误，只记录安全状态、编号、HTTP 状态及服务商消息 ID。服务商幂等窗口之外，极端崩溃可能产生重复测试邮件；不可用作交易记账。

provider_accepted 只表示服务商接受。必须在 Gmail 实际看到主题为“Easy English · 网站发信验收 · <编号>”的邮件，并核对编号，才能记录送达；Resend 注册欢迎邮件不能替代本项。
