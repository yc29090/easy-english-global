import {createHash} from 'node:crypto';
import {validateOgden,type OgdenContent} from './ogden-content.ts';
export function contentDigest(value:unknown):string{
 const canonical=(x:any):any=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
/** Editorial status is metadata; approving a reviewed draft must not invalidate its teaching digest. */
export function reviewDigest(item:unknown){
 const strip=(x:any):any=>Array.isArray(x)?x.map(strip):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([key])=>key!=='reviewStatus').map(([key,value])=>[key,strip(value)])):x;
 return contentDigest(strip(item));
}
/** Reports evidence, never grants access, approves content, or changes cloud state. */
export function ogdenReadiness(content:OgdenContent,decisions:Record<string,string>,reviews:Array<{id:string;version:number;digest:string;humanReviewer:string;decision:string;notes:string;reviewedAt:string}>=[]){
 validateOgden(content);
 const active=content.items.filter(x=>x.reviewStatus!=='retired');
 const checks=[
  {id:'editorial-review',passed:active.length>0&&active.every(x=>x.reviewStatus==='approved'&&reviews.some(r=>r.id===x.id&&r.version===x.version&&r.digest===reviewDigest(x)&&typeof r.humanReviewer==='string'&&r.humanReviewer.trim().length>0&&r.decision==='approved'&&typeof r.notes==='string'&&r.notes.trim().length>0&&typeof r.reviewedAt==='string'&&Number.isFinite(Date.parse(r.reviewedAt)))),reason:'每条活动教材及替换句需要有可追溯的人工审核记录；draft不能发布。'},
  {id:'primary-source',passed:content.originalReferences.length>0&&content.originalReferences.every(r=>r.verification==='verified')&&decisions.primarySourceReview==='confirmed',reason:'原版归属与分类必须核对权威原始资料。'},
  {id:'membership-policy',passed:decisions.membershipPolicy==='confirmed',reason:'需用户确认免费与会员范围；不自动修改99元规则。'},
  {id:'device-voice',passed:decisions.deviceVoiceReview==='confirmed',reason:'需记录真实设备的美式发音、低速行为与降级验收。'},
  {id:'deployment-authorization',passed:decisions.deploymentAuthorization==='confirmed',reason:'需要明确的合并和生产部署授权。'}
 ];
 return {version:content.version,contentDigest:contentDigest(content),readyForProduction:false,checksPassed:checks.every(c=>c.passed),productionRoutes:'disabled',counts:{items:active.length,words:active.filter(x=>x.kind==='word').length,authoredVariants:active.reduce((n,x)=>n+(x.variants?.length||0),0),approved:active.filter(x=>x.reviewStatus==='approved').length},checks};
}
export function ogdenReviewQueue(content:OgdenContent){
 return content.items.map(x=>({id:x.id,version:x.version,digest:reviewDigest(x),content:x,humanReviewer:null,decision:'pending',reviewedAt:null,notes:''}));
}
