import {validateTeaching} from './ogden-coverage.ts';
import {readFile} from 'node:fs/promises';
export const OGDEN_DOMAINS=[{id:'self-introduction',label:'自我介绍'},{id:'people-things',label:'人物与事物'},{id:'needs-wishes',label:'需求与意愿'},{id:'daily-actions',label:'日常动作'},{id:'time-place',label:'时间与地点'},{id:'quantity-price',label:'数量与价格'},{id:'problems-help',label:'问题与帮助'},{id:'family-friends',label:'家庭与朋友'},{id:'food-shopping',label:'饮食与购物'},{id:'transport-travel',label:'交通与旅行'},{id:'hotels-airports',label:'酒店与机场'},{id:'simple-work',label:'简单工作沟通'}];
export const OPERATORS=['come','get','give','go','keep','let','make','put','seem','take','be','do','have','say','see','send','may','will'];
export type OgdenItem={id:string;kind:'word'|'operator'|'pattern'|'combination'|'expression';version:number;english:string;chinese:string;reviewStatus:'draft'|'approved'|'retired';order:number;[key:string]:any};
export type OgdenContent={version:string;targetCoreCount:number;releaseStatus:string;domains:Array<{id:string;label:string}>;wordForms:Record<string,string>;sources:any[];originalReferences:any[];items:OgdenItem[]};
const check=(v:unknown,message:string)=>{if(!v)throw new Error('Ogden content: '+message);};
export function validateOgden(d:OgdenContent){
 check(d&&d.version&&Array.isArray(d.items)&&Array.isArray(d.sources)&&Array.isArray(d.originalReferences),'invalid manifest');
 const domains=new Set((d.domains||[]).map((x:any)=>x.id));check(domains.size===OGDEN_DOMAINS.length&&OGDEN_DOMAINS.every(x=>domains.has(x.id)),'incomplete functional domains');
 const wordNames=d.items.filter(x=>x.kind==='word').map(x=>x.english.toLowerCase());check(new Set(wordNames).size===wordNames.length,'duplicate core headword');
 const ids=new Set<string>(),sourceIds=new Set(d.sources.map(s=>s.id)),refs=new Set(d.originalReferences.map(r=>r.id));
 check(sourceIds.size===d.sources.length&&refs.size===d.originalReferences.length,'duplicate source/reference');
 for(const r of d.originalReferences){check(sourceIds.has(r.sourceId)&&r.sourceLocator,'untraceable reference');check(['pending-primary-review','verified'].includes(r.verification),'invalid original verification');}
 for(const x of d.items){
  check(/^[-a-z0-9]+$/.test(x.id)&&!ids.has(x.id),'duplicate/invalid ID');ids.add(x.id);
  check(['word','operator','pattern','combination','expression'].includes(x.kind),'invalid kind');
  check(Number.isInteger(x.version)&&x.version>0&&Number.isInteger(x.order)&&x.order>0,'invalid version/order');
  check(typeof x.english==='string'&&/[a-z]/i.test(x.english)&&typeof x.chinese==='string'&&/[\u3400-\u9fff]/.test(x.chinese),'missing bilingual text');
  check(['draft','approved','retired'].includes(x.reviewStatus),'invalid review');
  if(x.kind==='word'){
   check(refs.has(x.originalRef)&&['retained','replaced','added','extension'].includes(x.modernStatus)&&x.changeReason,'word provenance/status');
   check(x.category&&x.functions?.length&&x.patternIds?.length&&x.combinations?.length&&x.examples?.length&&x.scenarioIds?.length&&x.scenarioIds.every((id:string)=>domains.has(id)),'word teaching fields');
   check(typeof x.pronunciation?.arpabet==='string'&&x.pronunciation.arpabet.split(' ').every((p:string)=>/^[A-Z]+[012]?$/.test(p))&&x.pronunciation.dictionaryEntry&&sourceIds.has(x.pronunciation.dictionarySource),'missing selected American pronunciation');
   check(x.pronunciation?.locale==='en-US'&&x.pronunciation.primaryReading,'pronunciation metadata');
   const ref=d.originalReferences.find(r=>r.id===x.originalRef);
   check(x.isOgdenOriginal===null||typeof x.isOgdenOriginal==='boolean','invalid original membership');
   if(x.isOgdenOriginal===true)check(ref.verification==='verified','unverified original claim');
  }
  for(const e of [...(x.examples||[]),...(x.combinations||[])])check(e.english&&/[\u3400-\u9fff]/.test(e.chinese),'invalid example');
  if(x.kind==='pattern'||x.kind==='operator'){
   check(Array.isArray(x.variants)&&x.variants.length>=2,'pattern requires authored variants');
   const variantIds=new Set<string>();
   for(const v of x.variants){check(typeof v.id==='string'&&/^[-a-z0-9]+$/.test(v.id)&&v.id.startsWith(x.id+'-')&&!variantIds.has(v.id),'invalid/duplicate pattern variant');variantIds.add(v.id);check(v.label&&typeof v.english==='string'&&/[a-z]/i.test(v.english)&&typeof v.chinese==='string'&&/[\u3400-\u9fff]/.test(v.chinese),'invalid pattern variant text');check(['draft','approved'].includes(v.reviewStatus),'invalid variant review');if(x.reviewStatus==='approved')check(v.reviewStatus==='approved','unreviewed variant in approved pattern');}
  }
  if(x.kind==='expression'){check(domains.has(x.domain),'unknown expression domain');check([1,2,3,4].includes(x.level)&&x.evaluation==='self-assessment'&&new Set(x.answers).size>=2,'expression requires multiple references and self-assessment');}
  if(x.kind==='expression'&&x.level===2)check(x.variantPatternId&&d.items.some(p=>p.id===x.variantPatternId&&p.kind==='pattern'&&p.variants?.length>=2),'replacement task requires an authored pattern');
  if(x.kind==='combination')check(x.tokens?.length>1&&x.tokens.join(' ')===x.english,'invalid authored combination');
 }
 for(const x of d.items)for(const id of [...(x.wordIds||[]),...(x.patternIds||[]),...(x.wordId?[x.wordId]:[])])check(ids.has(id),'broken teaching reference: '+id);
 for(const op of d.items.filter(x=>x.kind==='operator')){
  check(d.items.some(w=>w.kind==='word'&&w.id===op.wordId&&w.english===op.english),'operator canonical word mismatch');
  const combos=d.items.filter(x=>x.kind==='combination'&&x.operatorWordId===op.wordId);
  check(combos.length>=3,'operator requires three authored combinations: '+op.id);
  check(Array.isArray(op.practiceCombinationIds)&&op.practiceCombinationIds.length===combos.length&&op.practiceCombinationIds.every((id:string)=>combos.some(x=>x.id===id)),'broken operator combination link');
 }
 for(const x of d.items){for(const id of x.patternIds||[])check(d.items.some(p=>p.id===id&&p.kind==='pattern'),'pattern link kind');if(x.kind==='combination')check(d.items.some(w=>w.kind==='word'&&w.id===x.operatorWordId&&OPERATORS.includes(w.english)),'combination operator link');}
 for(const [form,base] of Object.entries(d.wordForms||{}))check(typeof form==='string'&&wordNames.includes(String(base)),'invalid word form');
 check(JSON.stringify(d.items.filter(x=>x.kind==='operator').map(x=>x.english).sort())===JSON.stringify([...OPERATORS].sort()),'18 operators incomplete');
 for(const p of d.items.filter(x=>x.kind==='pattern'))check(p.structureHint&&p.expressionTaskIds?.length&&p.expressionTaskIds.every((id:string)=>d.items.some(x=>x.id===id&&x.kind==='expression')),'pattern teaching structure/tasks');
 for(const op of d.items.filter(x=>x.kind==='operator'))check(op.learningSteps?.length===6&&op.expressionTaskIds?.length,'operator learning path');
 validateTeaching(d);
 return d;
}
export async function loadOgden(){return validateOgden(JSON.parse(await readFile(new URL('../data/ogden/curriculum.json',import.meta.url),'utf8')));}
