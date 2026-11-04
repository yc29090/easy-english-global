import {readFile,writeFile} from 'node:fs/promises';
import {loadOgden} from '../src/ogden-content.ts';
import {ogdenReadiness,ogdenReviewQueue} from '../src/ogden-readiness.ts';
const args=process.argv.slice(2);
if(args.some(x=>!['--check','--export-review'].includes(x)))throw new Error('Use --check or --export-review');
const content=await loadOgden(),decisions=JSON.parse(await readFile(new URL('../data/ogden/launch-decisions.json',import.meta.url),'utf8'));
const reviews=JSON.parse(await readFile(new URL('../data/ogden/reviews.json',import.meta.url),'utf8'));
const report=ogdenReadiness(content,decisions,reviews);console.log(JSON.stringify(report,null,2));
if(args.includes('--export-review')){
 const rows=['# 教材人工审查清单','',`版本：${content.version}。活动教材${report.counts.items}条，其中${report.counts.words}个核心词；句型内含${report.counts.authoredVariants}条替换表达，不另计核心词。人工审核通过${report.counts.approved}条。`,'','每条检查自然度、准确性、中译、零基础难度、辅助词与美式发音。程序校验不代替人工审核。完整数据与版本摘要见 review-queue.json。','','| ID / 版本 | 类型 | 英文与参考表达 | 中文提示 | 状态 |','|---|---|---|---|---|'];
 for(const item of content.items){
  const lines=[item.english,...(item.examples||[]).map((e:any)=>e.english),...(item.combinations||[]).map((e:any)=>e.english),...(item.answers||[])];
  rows.push(`| ${item.id} / ${item.version} | ${item.kind} | ${[...new Set(lines)].join('<br>')} | ${item.chinese} | 待审核 |`);
  for(const v of item.variants||[])rows.push(`| ${v.id} / 父版本${item.version} | 受控替换 | ${v.english} | ${v.chinese} | 待审核 |`);
 }
 rows.push('','## 审核提交要求','','在 data/ogden/reviews.json 保存 id、version、digest、humanReviewer、decision（approved/rejected）、reviewedAt和审查理由；必须由实际审查者签署。review-queue.json 是待审核导出，不是审核结论。教材更新后必须重新核对摘要，旧版本审核不能覆盖新版本。程序不验证审查者真实身份，仍需项目负责人核验。不得自动填写审核人或批准结论。','','原版对照的来源、分类及规则需另行核对权威原始资料；当前全部待核实。自由表达允许多种说法；不将参考答案当唯一标准。来源或原版对照更正必须使用新的来源/对照ID，避免改写历史证据。');
 await writeFile(new URL('../docs/ogden/content-review.md',import.meta.url),rows.join('\n')+'\n');

 await writeFile(new URL('../docs/ogden/review-queue.json',import.meta.url),JSON.stringify({version:content.version,contentDigest:report.contentDigest,sources:content.sources,originalReferences:content.originalReferences,items:ogdenReviewQueue(content)},null,2)+'\n');
}
// A deliberately nonzero exit for unmet production gates; default report is informational.
if(args.includes('--check')&&!report.checksPassed)process.exitCode=1;
