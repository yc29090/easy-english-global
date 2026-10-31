# 免费测试部署说明

可使用 Render 免费 Web Service + Neon 免费 PostgreSQL（或其他提供标准 PostgreSQL 连接的平台）。第三方免费额度、地区、休眠和信用卡要求可能变化，应在创建服务时确认。这里提供配置步骤，尚未替你开通外部账号或产生费用。

1. 把本仓库连接到 Render，创建 Node Web Service，选择免费实例（若当前仍提供）。运行环境 Node.js 24。
2. Build Command: `npm install --omit=dev`；Start Command: `npm start`。也可选择仓库 Dockerfile；容器必须设置相同变量。
3. 创建 Neon PostgreSQL，取得含 `sslmode=require` 的连接字符串，保存为服务的 `DATABASE_URL`。保留 TLS 验证，不设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。
4. 设置 `APP_URL=https://你的实际域名`、`NODE_ENV=production`、`ALLOW_MOCK_CHECKOUT=true`（仅封闭测试，公开服务设 false）、`MAIL_FROM` 和 SMTP 变量。平台自动提供的 `PORT` 会被应用读取。
5. 在可以连接该数据库的受信任机器或平台一次性控制台执行 `npm run db:migrate`。不要把迁移数据库凭证提交到 GitHub。将实际生产环境变量配置到控制台，`.env.example` 只用于说明。
6. 通过临时环境变量提供 `ADMIN_EMAIL`、`ADMIN_PASSWORD`，运行 `npm run admin:create`，完成后移除这两个变量。不要在公开网页初始化管理员。
7. 如果有原版教材，执行 `npm run content:import -- /path/original.json`；缺失时保持等待导入状态。不要使用测试夹具。
8. 配置 SMTP。测试可用邮件沙箱（例如 Mailtrap；免费额度以其当前规则为准），确认忘记密码邮件可在沙箱收到。要让真实用户收信，需可向外发送邮件的 SMTP 和通过验证的发信地址。`SMTP_PORT=465` 为 TLS，587 为 STARTTLS；账号密码设置 `SMTP_USER` / `SMTP_PASS`。
9. 检查 `https://域名/health` 返回 `ok`。免费服务休眠后首次访问可能较慢。

## 上线验收

- 注册两个不同用户，验证学习记录互不相通。
- 管理员创建试用，复制唯一一次显示的临时密码；新用户先修改密码。
- 验证正常/慢速发音及手机窄屏、键盘导航、中英文切换。
- 创建模拟订单（99 元），确认后显示永久会员；无任何真实扣款。
- 禁用用户后旧会话不可继续调用 API；到期试用只能读取免费教材。
- 实际发送密码重置邮件，重置后旧会话失效，链接不能重复使用。
- 查看 GitHub Actions 的完整测试结果。当前开发环境未执行完整浏览器验收。

## 运维

`DATABASE_URL` 等秘密只存在云服务环境变量。对数据库启用备份与恢复；删除容器卷会丢失本地记录。升级前先备份，迁移脚本当前是幂等初始建表，后续结构升级应新增编号迁移，不要修改已有生产迁移。

定期执行以下清理（通过受信任维护任务）：

```sql
DELETE FROM sessions WHERE expires_at < now();
DELETE FROM password_resets WHERE expires_at < now();
DELETE FROM rate_limits WHERE expires_at < now();
```

服务运行时不依赖 Sites/Cloudflare D1，所有持久化数据均存 PostgreSQL；免费服务的数据库、邮件及应用需要分别配置。

## 已有 v1 数据库升级到听说学习版

先备份数据库，然后拉取新源码、安装依赖，运行 `npm run db:migrate`，再启动新应用。迁移 `002_learning_method.sql` 为增量操作：保留用户、角色、试用期限、会员、订单、教材和原学习状态，只增加复习计划、课程顺序、继续学习位置和陪练进度。旧学习记录会按原状态和最后更新时间补齐下次复习时间。编号迁移只执行一次，并用事务和数据库锁保护；再次执行不会重置复习时间。

新应用依赖新字段，应先完成迁移再切换应用版本。不要手工删除学习表或重新填充教材。当前部署仍需人工配置数据库及 SMTP。
