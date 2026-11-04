# Ogden来源核查与现代改编边界

本轮由Codex依用户“自行查找并确认”的指令查阅以下来源。没有购买资料、创建付费账号或绕过访问限制。

## 查阅到的可靠资料

1. [马克斯·普朗克研究所书目](https://www.mpi.nl/publications/item2366945/basic-english-general-introduction-rules-and-grammar)：确认Ogden于1930年出版相关著作。网页提供PDF入口，但该文件返回403；只确认书目，没有声称读过该完整原书PDF。
2. [布加勒斯特大学／Contemporary Literature Press学术版介绍](https://editura.mttlc.ro/FW-lexicography-theoretical-backup.html)及[Volume 57 PDF](https://editura.mttlc.ro/ccount212/click.php?id=FW-lexicography-theoretical-backup-57)：C. George Sandulescu编辑，2013，ISBN 978-606-8366-86-9。该资料包含Ogden原文节选与历史词表。PDF第39–41页（从1计）为字母表，第42–44页为分类表；对应印刷页31–36。它是学术重印/编选，不是1930初版完整扫描，也没有把2013编辑导言当作Ogden原文。
3. [历史分类词表转录](https://zbenglish.net/sites/basic/words.html)与[第二章规则转录](https://zbenglish.net/sites/basic/be2.html)：交叉核对18操作词、词表分类、词形、代词扩展与提问/否定方法。转录中存在拼写/OCR问题，不照抄其有问题的句子。
4. 原有仓库保存的[固定提交第三方转录](https://github.com/bnspalding/wordlists/blob/578c6b902de88d8bc394d6aa943549de8ca25e54/ogden850.words)：保留原始852行及SHA256，不改写历史文件。它作为交叉核对依据，不独自承担原版权威性。

## 852行与850词汇项的差异

原始转录分别列入gray、grey及plow、plough。学术重印分类表把这些写作两组拼写变体，每组只计一个词汇项。规范化这两组后，程序得到850个唯一词汇项；不是删除两个不喜欢的词来凑数。

`historical-index.json` 保存850个规范化历史参考项、变体规则与来源。它没有现代中文教学、例句或用户掌握状态，不是“完成850词现代教材”。它也不是对1930初版每个字形的外交式转录；学术重印采用的部分美式拼写与初版拼写问题应分别对待。

历史索引另存逐词分类，已按分组表校验各类数量：100操作/结构词、400一般事物词、200可图示事物词、100一般性质词、50相反性质词。18操作词只是100操作/结构词的一部分；不能把那100词都说成动词，也不能把may/will同普通动作词处理。

## 现代101核心词

83个词可对应上述历史独立词头，18个单列词明确标为现代新增或规则派生形式。例如we/she/it/they/what在规则中有用途，但不是原词表的独立词头；phone/email/computer等现代高实用词单列为现代新增。每词有稳定ID、历史归属、关系、来源定位、分类、选择理由、组合和独立编写的现代例句。

原词头和原用法也不同：例如历史表把need列在事物类，本课程自然地教授I need这一现代动词用法，并明确记录为现代适配；不机械要求学习者用不自然的句子回避它。

原版中作为扩展使用的词形和当代新增词，都不因此冒称原版850的独立词头。现代选择基于日常实用性、组合能力、教学负担与场景覆盖的编辑判断；没有虚构现代语料频率排名或统计分数。

## 教材自查

用户明确授权开发者自查。165个教学条目及句型内33条替换表达已逐条检查中译、自然度、冠词/词形、组合含义、表达功能及多解原则；依据保存在版本绑定的reviews.json。记录reviewerKind=developer-self-check、reviewer=Codex (AI developer)、humanReviewer=null。独立真人审核数仍为0。

自查通过不等于真机耳听验收或独立专业审稿。需要继续扩充的现代850目标、完整发音音标、更多生活场景仍按计划推进，不用历史索引数量替代现代课程数量。
