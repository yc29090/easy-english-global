# 99元终身会员人工收款上线状态

已启用人工扫码收款：微信／支付宝，人民币 99 元（9900 分）。商品金额由服务端固定，客户申报不等于到账。只有管理员核对真实到账后批准，才开通终身会员；生产模拟支付保持关闭。

## 实际验收

- 两张原图归属本人、手机扫码显示正常：由所有者在会话中确认，原图及 SHA-256 保存在 docs/payment-qr-assets.json。
- Gmail 官方 OAuth 回调已保存本人 sdqtyc@gmail.com 授权。验收邮件编号 42a3d12c-dbd9-4c69-a30b-03bb606aaba6 已由所有者确认来自实际收到的 Gmail 邮件正文。
- 77 项主测试、13 项 PTY、12 项嵌入式数据库及两次启动共 28 项检查通过，依赖审计通过。并发订单/重复审核、权限和申报不升级、通知失败重试均已验证。
- Gmail 通知复用请求连接，避免并发请求耗尽 Free 实例连接池；已添加 HTTP 实测。
- 线上只读检查按部署记录验证开关、二维码原图、匿名与跨域拒绝。专用 QA 下单/申报测试单独显式触发，不转账、不批准会员；完成后禁用该 QA 账号并关闭其测试订单，保留所有原有数据。

## 部署与费用

源码 8b90ac2dee9d7a82cc34c651e16cd49829e3d50c，Render 部署 dep-dbjijhu7bikc73findv0 已为 live。MAIL_PROVIDER=gmail；MANUAL_PAYMENT_ENABLED=true；MANUAL_PAYMENT_ACCEPTANCE_VERIFIED=true；ALLOW_MOCK_CHECKOUT=false。原有管理员与所有用户、学习、教材数据保留。Render 和 Neon 均保持 Free，无新建付费资源。

## Google 发布状态的实际限制

所有者最新截图显示 Google 应用仍为 Testing，品牌配置不完整导致“发布应用”不可用，不能声称 Google 已正式发布。所有者明确要求在已经完成真实送达和安全验收后尽快上线，故开启现有可用 Gmail 授权下的人工支付。

Testing 涉及 Gmail 范围的刷新授权通常七天到期；本次授权保存于 2026-11-01 11:27:52 UTC，估计应在 2026-11-08 11:27:52 UTC 前完成品牌配置、发布及重新授权。不能承诺无限期有效。若邮件授权失效，任务记录失败并可重试，管理员后台仍保留订单，不能将客户申报或截图当作真实到账。相关配置见 docs/gmail-oauth.md。

## 上线后的真实环境验证

只读线上验收通过：https://github.com/yc29090/easy-english-global/actions/runs/41304573698 ，确认 manualPayment=true、mockCheckout=false、两张二维码原图 SHA-256 一致、匿名及跨域写入被拒绝。

专用 QA 订单验收通过：https://github.com/yc29090/easy-english-global/actions/runs/41304573690 。固定 9900 分／CNY，重复创建复用同一订单，申报后会员仍为 free，普通用户审核被拒绝。Gmail 通知任务显示 sent、attempts=1（服务商已接受，不另行声称该封 QA 提醒已被所有者打开）。

专用账号 ee-launch-41304573690@example.invalid 已禁用，测试订单 43e00bdf-7be9-45be-86e4-bc9917ea688b 已关闭为 rejected，未设置人为审核人、未转账、未批准会员。原有 7 个用户完整行内容指纹、75 条学习记录和 700 条教材指纹均保持不变；新测试账号及订单保留，不删除原数据。
