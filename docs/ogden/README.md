# 简单英语2.0：Modern Basic English

当前`mbe-modern-850-v7-final-audit`：850现代核心词、18操作词、48功能句型、109组合、140表达任务，共1165教学条目；144句型替换及54操作词替换不另计核心词。历史匹配438，现代/规则单列412，不冒称Ogden原版850成品。全部完成Codex开发者自查，独立真人审核0。

表达四层为模仿、受控替换、自主表达、简单改述。140项按意图去重131种；自主表达/改述113种意图各至少有一条核心词与明确词形支持的参考。它是教材覆盖指标，不是用户能力评分。[逐参考覆盖证据](expression-coverage.json)保留辅助词，不将未知词算作已掌握。

在现有网站使用/ogden及独立ogden_表，保留1.0教材/进度/会员支付/管理员。词条有顺序与依赖；操作词有组合→例句→替换→表达→复习；句型有结构说明、受控替换和任务。自由选课，无强制闯关/每日限额。列表分批显示并保留输入，教材目录可协商gzip。

99元终身会员覆盖两版已发布内容，无额外收费；试用期不变，不扩大非会员免费范围。非预览API要求现有有效会员并只接受批准教材，预览来自服务端上下文。PR #10为Draft，生产2.0入口仍404。

008/009增量隔离结构保留来源、审核、旧版本、进度及事件，重复导入不清空记录；五种模式各自复习，操作词共用词条掌握。真实v5升级回归见tests/ogden-round3.test.ts。

历史来源是学术重印与转录交叉核查，未取得1930初版完整扫描。CMU固定版本美式ARPABET不是IPA或录音；设备只用本地en-US合成，支持正常/低速请求/重复/停止/明确降级，不录音、不上传、不接付费TTS。Android/iPhone真机未验收。

## 验证命令

```sh
npm run typecheck
npm run content:validate
npm run ogden:validate
npm run ogden:coverage
npm run ogden:readiness
npm test
npm run test:ogden:mobile
```

ogden:preview仅启动本地临时PGlite，不读取生产DATABASE_URL。ogden:readiness -- --check在设备/发布条件不足时非零退出，报告不授予部署权。

[第三轮详细记录](round3-acceptance.md) · [可审查教材清单](content-review.md) · [来源](source-audit.md)。真实CI以PR最新提交为准。未操作生产Neon、Render配置或收费资源；最终设备验收与合并/部署仍需明确授权。

第四轮完成代码/教材复查与本地隔离预览，覆盖计数修正并保留旧ID。[第四轮记录](round4-acceptance.md) · [真机操作](device-acceptance.md) · [隔离预览](preview-plan.md) · [发布/回滚检查](release-safety.md)。最终CI看PR当前提交；真机/Neon/生产验收仍待执行。
