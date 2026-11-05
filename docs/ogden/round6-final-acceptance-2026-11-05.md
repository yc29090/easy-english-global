# 第六轮最终验收补充（2026-11-05）

结论：**BLOCKED（正式发布）**。保留 PR #10 为 Draft，不合并、不部署、不修改生产配置、不执行生产迁移、不创建收费资源。本文补充原 [第六轮报告](round6-acceptance.md)，不重做已完成的开发。

## 验收对象与来源边界

- 仓库：yc29090/easy-english-global；开发分支：feature/modern-basic-english-v2。
- 本轮实际核验的应用提交：`73eadf4e8c55bba2918c8fcfe3bc4c3dcd548aa5`。
- 用户报告上次已完成依赖锁定、安全审计、153项本地回归（149通过、0失败、4跳过）。恢复的执行环境仍是另一旧修复分支，相关未提交修改未出现在本环境；核验提交的完整 Git tree 也没有 package-lock.json/npm-shrinkwrap.json。本轮保留用户的工作，不重新生成锁文件或覆盖分支，**不将用户报告冒充本轮独立复验**。发布前需取回对应源码、锁文件和审计产物，并确认它们绑定的提交。
- 本补充仅增加验收文档，不包含旧工作区中未提交的播放器、音频或其他无关修改。

## 数据库跳过项：逐项核实

[CI 41845878866](https://github.com/yc29090/easy-english-global/actions/runs/41845878866) 的原始主测试 job `126629105964` 使用 PostgreSQL 16 服务容器及 TEST_DATABASE_URL。日志确认 **150通过、0失败、0跳过**，以下4项均实际执行通过：

| 本地无真实PG时跳过的用例 | 来源 |
| --- | --- |
| PostgreSQL concurrent creation and reviews produce one order and one audit event | tests/manual-payment.test.ts |
| V2 PostgreSQL: concurrent identical saves count once with per-user serialization | tests/learning-v2-db.test.ts |
| PostgreSQL concurrent retries increment per-mode attempts only once | tests/ogden-practice.test.ts |
| real PostgreSQL backend termination during migration rolls back DDL and releases the migration lock | tests/ogden-recovery.test.ts |

额外 PGlite 子集为13通过、0失败、2跳过；不能把嵌入式数据库当成真实多连接PG。本表的覆盖结论来自原主测试日志，不是仅看绿色状态。管理员伪终端13项通过。不同测试集合的数字不混加成用户报告的153项。

## 手机自动化补跑

本轮只请求重跑既有 mobile job，run `41845878866` attempt 2，job `127189899250`，源提交仍为上述73eadf4；原主测试结果沿用，不声称重新执行。2026-11-05 10:31:40 UTC 补跑完成：原有浏览器4/4；2.0共21/21（Android Chromium 7/7、iPhone尺寸Chromium 7/7、iPhone WebKit 7/7），0失败、0跳过。原有语速测试包含语音API参数模拟，不能证明真机慢速听感。

既有 job 配置会同时执行原浏览器用例及全部3个2.0项目（Android Chromium、iPhone尺寸Chromium、iPhone WebKit）；本轮不改配置、不放松断言、不新增测试服务。目标 Android/iPhone WebKit 各7项中，各有2项明确使用mock API，5项走隔离预览流程。模拟不是实际软键盘、Android/iPhone真机、系统麦克风或真实音质验收。

## 教材质量

850现代词、18操作词、48句型、109组合、140表达任务、198替换；1165父教学条目。438历史词头对照、412现代/规则单列，不宣称这就是原版Ogden850。结构、来源、版本绑定和审核摘要由当前CI校验。

既有1165条为Codex开发者自查；本轮前期重点复核158条（140表达任务+18操作词），修正seem说明并保留5项语境注意点。独立真人审核仍0；113种自主/改述意图覆盖不等于学习者掌握或语义评分。保留原人工审核表，不由脚本代签。

1.0教材仍500词、200短句、20场景、100对话、406双语台词。没有在本轮重新导入或修改生产教材、管理员、会员、订单或进度。

## 备份：只读证据

2026-11-05再次通过Neon列表确认快照 `snap-muddy-mouse-b50eb3wd` 仍存在，创建时间2026-11-04 13:28:47 UTC，来源main分支。第五轮隔离恢复23表一致及副本008/009演练为历史证据，本轮未重新恢复或迁移。

原CI合成备份恢复32表、850词、5模式，`restoredRecordsExactly=true`、`productionTouched=false`；备份504626字节，SHA256 `e09dd7ab371903750ec42f06fb38f6799cd8f47f78abe0be6239d4c956d7ada9`。它不证明生产当前所有写入已备份。

发布前仍需确认快照后的用户写入、备份时效与可信恢复目标。本轮未创建、删除、切换快照/分支，未导出真实用户行或凭据。

## 免费套餐与生产发布安全

只读核实：
- Render服务 `srv-dbj23vmtlv9c73c1jpo0` 运行套餐free、1实例、main、autoDeploy=no、预览关闭；HTTP健康路径仍为空。本轮未修改。
- Render最新live仍 `dep-dbl6o261egvs73duhjr0`，应用提交 `6c4c3cfd8407878439194e2f347e7c4bd791f729`，不是本PR的2.0版本。
- Neon组织 `org-odd-queen-25574943` 套餐free，项目仍 `soft-tooth-72285618`。没有创建或升级资源。
- 现有连接器无法证明Render剩余构建分钟、共享实例小时、流量余额和超额硬停止机制；Neon Free标签同样不能代替所有剩余额度/超额策略的账单核验。不调用要求付费套餐的消费指标API来补证。
- OGDEN_PUBLISHED默认关闭的约束保留，人工支付和生产模拟支付不应开启；本轮未读取秘密环境变量，未修改任何生产开关。未把历史检查当成本日开关复验。
- 没有运行线上登录、写入或会员测试，也没有触发Render构建/部署。本轮线上Smoke仍NOT_RUN，需等待发布授权及明确测试账号安排。

## 全部剩余发布阻塞项

1. 对齐用户报告的153项版本、锁文件和安全审计产物与实际候选提交；当前仅能独立核验PR远端提交。
2. Render/Neon账期剩余额度与超额处理的账户侧证据未闭环；不能仅凭Free标签承诺零新增费用。
3. 当前生产备份时效、快照后的写入覆盖及恢复目标仍须发布前确认。
4. Android/iPhone真机声音、慢速、麦克风、后台恢复和真实键盘验收NOT_RUN；自动化模拟不代签。
5. 独立真人教材审核0，审核范围、发现与验收结论尚待真实审查者记录。
6. 线上Smoke NOT_RUN，尚需授权的测试账号及实际发布后的验证窗口。
7. 等待用户最后一次上线授权。此前不合并、不部署、不执行生产迁移、不改生产配置。

本补充的文档提交仍须通过PR最新CI；最终提交和CI链接以PR检查与交付报告为准，不把提交成功等同于上线成功。
