import {readFile,writeFile} from 'node:fs/promises';
import {loadOgden} from '../src/ogden-content.ts';
import {ogdenReadiness,ogdenReviewQueue} from '../src/ogden-readiness.ts';
const args=process.argv.slice(2);
if(args.some(x=>!['--check','--export-review'].includes(x)))throw new Error('Use --check or --export-review');
const content=await loadOgden(),decisions=JSON.parse(await readFile(new URL('../data/ogden/launch-decisions.json',import.meta.url),'utf8'));
const reviews=JSON.parse(await readFile(new URL('../data/ogden/reviews.json',import.meta.url),'utf8'));
const report=ogdenReadiness(content,decisions,reviews);console.log(JSON.stringify(report,null,2));
if(args.includes('--export-review')){
 const rows=['# 教材人工审查清单','',`版本：${content.version}。活动教材${report.counts.items}条，其中${report.counts.words}个核心词；句型内含${report.counts.authoredVariants}条替换表达，不另计核心词。开发者自查通过${report.counts.developerSelfChecked}条，独立真人审核${report.counts.humanReviewed}条。`,'','已依用户明确授权逐条开发者自查自然度、准确性、中译、零基础难度、辅助词及发音策略；未冒称独立真人审阅或真机音质验收。完整数据与版本摘要见 review-queue.json。','','| ID / 版本 | 类型 | 英文与参考表达 | 中文提示 | 状态 |','|---|---|---|---|---|'];
 for(const item of content.items){
  const lines=[item.english,...(item.examples||[]).map((e:any)=>e.english),...(item.combinations||[]).map((e:any)=>e.english),...(item.answers||[])];
  rows.push(`| ${item.id} / ${item.version} | ${item.kind} | ${[...new Set(lines)].join('<br>')} | ${item.chinese} | ${item.reviewMethod==='developer-self-check'?'开发者自查通过':'待审核'} |`);
  for(const v of item.variants||[])rows.push(`| ${v.id} / 父版本${item.version} | 受控替换 | ${v.english} | ${v.chinese} | ${v.reviewStatus==='approved'?'随父句型自查通过':'待审核'} |`);
 }
 rows.push('','## 审核方法','','data/ogden/reviews.json 为逐条版本绑定的开发者自查证据，reviewerKind=developer-self-check、reviewer=Codex (AI developer)、humanReviewer=null。用户已明确授权自查，不需要重复请用户逐条审核。该记录不冒称独立教师签署。review-queue.json 保留可审查的教材全量快照；任何内容/版本变化均使旧摘要失效。','','历史词表依据2013大学出版社学术重印与历史转录交叉核查；不是1930初版完整扫描校勘。现代新增词与规则派生形式分别注明，不冒称原表词头。自由表达允许多种正确说法。真机测试模板按用户要求在全部开发完成后统一发送。');
 await writeFile(new URL('../docs/ogden/content-review.md',import.meta.url),rows.join('\n')+'\n');

 await writeFile(new URL('../docs/ogden/review-queue.json',import.meta.url),JSON.stringify({version:content.version,contentDigest:report.contentDigest,sources:content.sources,originalReferences:content.originalReferences,items:ogdenReviewQueue(content)},null,2)+'\n');
}
// A deliberately nonzero exit for unmet production gates; default report is informational.
if(args.includes('--check')&&!report.checksPassed)process.exitCode=1;
