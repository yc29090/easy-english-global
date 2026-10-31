# 教材校验与安全导入

项目已提供 `data/curriculum.json`：500 单词、200 短句、20 场景、100 段双人对话。编排、来源及许可见 [教材说明](../data/README.md)。

```sh
npm run content:validate
npm run db:migrate
npm run content:import
# 或导入经过校验的外部完整 JSON
npm run content:import -- /absolute/path/curriculum.json
```

导入使用独立数据库连接、事务、数据库锁和版本哈希。只插入缺失行，不更新或删除现有行。再次导入相同版本返回零新增；发现 ID、英文词条、翻译或版本冲突时整体回滚。它不会删除、覆盖或重置 `progress`、`learning_state`、`practice_progress`、用户、试用、会员或订单。已有无关教材也会保留，因此已有数据库的总条数可能大于本套教材的 700 条。

已有同名英文、不同 ID 的教材不会被强制替换。如果遇到冲突，应审核原数据和稳定 ID 的对应关系，再制定单独迁移；不要删除原记录“解决”冲突。已安装版本不接受静默修改；教材修订需显式版本管理和保留学习记录的迁移方案。

## JSON 结构

根字段：`version`、`source`、`license`、`scenes`、`materials`、`dialogues`。

- 场景：`id`, `title_en`, `title_zh`, `category`（life/travel/business）, `difficulty`（1/2/3）。
- 教材：`id`, `kind`（word/phrase）, `english`, `chinese`, `scene_id`, `is_free`, `difficulty`, `sort_order`；可选 `audio_normal` / `audio_slow`（HTTPS URL）。
- 对话：`id`, `scene_id`, `title_en`, `title_zh`, `category`, `difficulty`, `is_free`, `roles`, `turns`。
- `roles.a` / `roles.b` 各包含 `zh` 和 `en`；`turns` 中每条包含 `role`、`english`、`chinese`。

校验要求：恰好 500 单词、200 短句、20 场景，每场景至少 5 段完整对话；每段至少 4 句、偶数句，两人轮流发言，英中字段完整。内容、场景分类和难度一致。英文按大小写、空格和标点标准化去重，不能重复整段对话。对话中常见的礼貌回应可自然复用。

课程对话存入 PostgreSQL `curriculum_dialogues`，经服务端权限过滤后接入原有陪练界面；免费账号和未登录访客不能通过目录 API 获取会员对话台词，也不能伪造陪练保存请求绕过权限。原有 3 个补充陪练及其进度 ID 保持不变。
