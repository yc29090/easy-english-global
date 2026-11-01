# Google 品牌配置、发布和重新授权操作单

网站页面和表单资料可以由部署代理准备，但 Google Cloud 品牌设置、发布以及 Google 登录同意需要项目所有者的管理会话。当前 Gmail API 的 gmail.send 授权不能修改 Google Cloud 项目或 OAuth 品牌，不能代替项目管理权限。

## 已准备的字段

应用名称：`Easy English Global`
用户支持邮箱：`sdqtyc@gmail.com`
开发者联系邮箱：`sdqtyc@gmail.com`
应用首页：`https://easy-english-global.onrender.com/`
隐私政策：`https://easy-english-global.onrender.com/privacy`
服务条款：`https://easy-english-global.onrender.com/terms`
应用说明（用于介绍或审核补充）：`https://easy-english-global.onrender.com/about`
已获授权的网域（如表单要求填写，不含协议或路径）：`easy-english-global.onrender.com`

官方 Public Suffix List 已列出 onrender.com，应用使用其独立服务子域名；这不等于已完成 Google 域名归属验证。Google 若另要求验证，按实际控制台提示处理。

应用徽标可留空，不上传不属于本网站的图标。OAuth 客户端名称 `Easy English Mail 2` 只是控制台内部名称，不需要重建客户端或更换密钥。

## 所有者操作

1. 登录 https://console.cloud.google.com/auth/branding ，选择 `easy-english-mail` 项目。填入上述对应字段，保存。不要切换到其他项目，不开通付费试用或绑定账单。
2. 在 https://console.cloud.google.com/auth/audience 检查发布状态，确认品牌设置已保存后，按实际页面执行“发布应用”及确认。发布状态变为 In production 才可记录为发布完成。Google 审核、品牌验证与发布状态是不同事项，不把其中一项冒充另一项。
3. 若 Google 要求域名归属或敏感权限审核，保留实际提示并按要求处理。网站使用的是 Render 子域名，不能声称拥有 onrender.com 根域名，不能猜测或伪造验证记录。Google 的审核是否适用及是否通过以控制台为准，不能保证一次提交即可发布或通过审核。
4. 发布成功后，以原有管理员登录网站，在管理页点击“通过 Google 授权发信”，选择 sdqtyc@gmail.com，重新完成 Google 官方同意。不要先撤销现有可用授权，避免中断当前通知；成功回调将替换加密刷新凭据。若失败，保留错误提示，不上传密钥或验证码。
5. 点击“发送 Gmail 验收邮件”，核对新编号的实际收件。代理检查新的 connected_at、tested_at 及审计记录，结合所有者收件确认记录结果。此前 Testing 下收到的旧邮件不能替代发布后的新授权验证。

## 准备的最小权限说明

openid 和 email：核对网站所有者已验证的邮箱身份。gmail.send：代表网站所有者发送订单待核实通知、发信验收邮件和用户主动请求的密码重置邮件。不请求读取、搜索、修改或删除 Gmail 邮箱的权限。不要求普通学习者授权 Google 邮箱。

若 Google 要求演示，可录制：网站管理员登录 → 管理页 → Google 授权与权限说明 → 回到网站显示已连接 → 测试发信 → Gmail 实际收件。演示中遮盖用户密码、客户端秘密、访问令牌与刷新令牌，不提交真实客户订单信息。

## 实际状态

当前支付已按所有者指令开启，既有 Gmail 授权可用，最后已知 Google 发布状态仍为 Testing。网站隐私/条款页面已准备，但品牌字段写入 Google、生产发布和发布后的重新授权在完成实际操作前均保持待办，不可标记成功。

官方依据：
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/identity/protocols/oauth2#expiration

Public Suffix List 参考：https://publicsuffix.org/list/public_suffix_list.dat （onrender.com 条目）

## 网站资料部署结果

PR #6 合并，78 项主测试和完整 CI 通过：https://github.com/yc29090/easy-english-global/actions/runs/41305531761 。部署 dep-dbjis0g473hc739vqss0 于 2026-11-01T12:18:45.539595Z 成为 live。公开首页、/about、/privacy、/terms 与页脚入口已上线。没有 Google Cloud 管理会话，品牌字段写入、发布以及发布后的重新授权仍未验证，不标记完成。当前收款和原 Gmail 授权保持可用，没有重建账号或修改学习记录。

## Search Console HTML 文件准备

所有者提供文件名 googleddf3db021b6b2ec7.html。上传文件实际为约 955 KB 的 Google 登录页面，而非验证文本，因此没有原样发布该登录页。依据用户提供的验证文件名和 Google Site Verification 官方 FILE 格式，恢复为一行公开文本：

`google-site-verification: googleddf3db021b6b2ec7.html`

通过固定静态路由 /googleddf3db021b6b2ec7.html 提供，不开放任意静态文件、不执行上传脚本、不请求新 Google 权限。只有实际公开地址返回 HTTP 200 和上述内容后，才提示所有者在 Search Console 重试；文件可访问不等于 Google 已确认所有权。品牌、发布和重新授权的结果仍分别待核实。

FILE 格式官方依据：https://developers.google.com/site-verification/v1/getting_started
