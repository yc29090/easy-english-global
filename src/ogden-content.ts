import {readFile} from 'node:fs/promises';
export const OPERATORS=['come','get','give','go','keep','let','make','put','seem','take','be','do','have','say','see','send','may','will'];
export type OgdenItem={id:string;kind:'word'|'operator'|'pattern'|'combination'|'expression';version:number;english:string;chinese:string;reviewStatus:'draft'|'approved'|'retired';order:number;[key:string]:any};
export type OgdenContent={version:string;targetCoreCount:number;releaseStatus:string;sources:any[];originalReferences:any[];items:OgdenItem[]};
const check=(v:unknown,message:string)=>{if(!v)throw new Error('Ogden content: '+message);};
export function validateOgden(d:OgdenContent){
 check(d&&d.version&&Array.isArray(d.items)&&Array.isArray(d.sources)&&Array.isArray(d.originalReferences),'invalid manifest');
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
   check(x.category&&x.functions?.length&&x.patternIds?.length&&x.combinations?.length&&x.examples?.length,'word teaching fields');
   check(x.pronunciation?.locale==='en-US'&&x.pronunciation.primaryReading,'pronunciation metadata');
   const ref=d.originalReferences.find(r=>r.id===x.originalRef);
   check(x.isOgdenOriginal===null||typeof x.isOgdenOriginal==='boolean','invalid original membership');
   if(x.isOgdenOriginal===true)check(ref.verification==='verified','unverified original claim');
  }
  for(const e of [...(x.examples||[]),...(x.combinations||[])])check(e.english&&/[\u3400-\u9fff]/.test(e.chinese),'invalid example');
  if(x.kind==='pattern'){
   check(Array.isArray(x.variants)&&x.variants.length>=2,'pattern requires authored variants');
   const variantIds=new Set<string>();
   for(const v of x.variants){check(typeof v.id==='string'&&/^[-a-z0-9]+$/.test(v.id)&&v.id.startsWith(x.id+'-')&&!variantIds.has(v.id),'invalid/duplicate pattern variant');variantIds.add(v.id);check(v.label&&typeof v.english==='string'&&/[a-z]/i.test(v.english)&&typeof v.chinese==='string'&&/[\u3400-\u9fff]/.test(v.chinese),'invalid pattern variant text');check(['draft','approved'].includes(v.reviewStatus),'invalid variant review');if(x.reviewStatus==='approved')check(v.reviewStatus==='approved','unreviewed variant in approved pattern');}
  }
  if(x.kind==='expression')check([1,2,3].includes(x.level)&&x.evaluation==='self-assessment'&&new Set(x.answers).size>=2,'expression requires multiple references and self-assessment');
  if(x.kind==='combination')check(x.tokens?.length>1&&x.tokens.join(' ')===x.english,'invalid authored combination');
 }
 for(const x of d.items)for(const id of [...(x.wordIds||[]),...(x.patternIds||[]),...(x.wordId?[x.wordId]:[])])check(ids.has(id),'broken teaching reference: '+id);
 check(JSON.stringify(d.items.filter(x=>x.kind==='operator').map(x=>x.english).sort())===JSON.stringify([...OPERATORS].sort()),'18 operators incomplete');
 return d;
}
export async function loadOgden(){return validateOgden(JSON.parse(await readFile(new URL('../data/ogden/curriculum.json',import.meta.url),'utf8')));}
