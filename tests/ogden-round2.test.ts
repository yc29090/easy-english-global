import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadOgden,validateOgden} from '../src/ogden-content.ts';
import {installOgden} from '../src/install-ogden.ts';
import {prepareDatabase} from '../src/setup.ts';
import {ogden} from '../src/ogden.ts';
import {isolatedDatabase} from './test-db.ts';
const c=await loadOgden();
test('850 plan is a budget, not completed words; new batch has bilingual examples, scenarios and source evidence',async()=>{
 const plan=JSON.parse(await readFile(new URL('../data/ogden/curriculum-plan.json',import.meta.url),'utf8'));
 assert.equal(plan.currentApprovedCore,850);assert.equal(Object.values(plan.domainBudgets).reduce((a:number,b:any)=>a+b,0),850);
 assert.deepEqual(plan.batches.map((b:any)=>b.targetTotal),[300,450,600,725,850]);assert.equal(plan.batches.filter((b:any)=>b.status==='developer-self-checked').length,5);
 const words=c.items.filter(x=>x.kind==='word'),added=words.filter(x=>x.order>=218&&x.order<=300);assert.equal(added.length,83);
 for(const w of words){assert.ok(w.scenarioIds.every((id:string)=>c.domains.some(d=>d.id===id)));assert.ok(w.examples.every((e:any)=>e.english.trim().endsWith('.')||e.english.trim().endsWith('?')));assert.ok(w.examples.every((e:any)=>/[\u3400-\u9fff]/.test(e.chinese)));assert.ok(w.changeReason&&w.originalRef&&w.patternIds.length&&w.combinations.length);}
 assert.equal(words.find(w=>w.english==='close')!.pronunciation.arpabet,'K L OW1 Z');assert.equal(words.find(w=>w.english==='close')!.pronunciation.contextPlayback,true);
 for(const op of c.items.filter(x=>x.kind==='operator')){assert.ok(op.combinations.length>=4);assert.ok(op.combinations.every((co:any)=>co.examples.length&&co.examples.every((e:any)=>e.english&&e.chinese)));}
 for(const damage of ['scenario','level','replacement']){const d=structuredClone(c);if(damage==='scenario')d.items.find(x=>x.kind==='word')!.scenarioIds=['invalid'];if(damage==='level')d.items.find(x=>x.kind==='expression')!.level=5;if(damage==='replacement')delete d.items.find(x=>x.kind==='expression'&&x.level===2)!.variantPatternId;assert.throws(()=>validateOgden(d));}
});
test('four expression stages retain authored replacements and multiple references without semantic grading',()=>{
 const tasks=c.items.filter(x=>x.kind==='expression');assert.deepEqual([...new Set(tasks.map(x=>x.level))].sort(),[1,2,3,4]);
 assert.equal(tasks.filter(x=>x.level===2).length,4);assert.ok(tasks.filter(x=>x.level===4).length>=8);
 for(const t of tasks){assert.equal(t.evaluation,'self-assessment');assert.ok(new Set(t.answers).size>=2);if(t.level===2){const pattern=c.items.find(x=>x.id===t.variantPatternId)!;assert.equal(pattern.variants.length,3);assert.ok(pattern.variants.every((v:any)=>v.english&&v.chinese&&v.reviewStatus==='approved'));}}
});
test('curriculum upgrades preserve independent practice dates, attempt counts, historical events and user isolation',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);await installOgden(db,c);const user=randomUUID(),other=randomUUID();
  for(const id of [user,other])await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[id,id+'@example.invalid']);
  for(const [mode,status] of [['listening','unmastered'],['speaking','mastered']])await ogden({db,userId:user,path:'/api/ogden/results',method:'POST',body:{item_id:'ow-close',mode,status,request_id:randomUUID()}});
  const snapshot=async()=>({shared:(await db.query('SELECT * FROM ogden_progress ORDER BY item_id')).rows,modes:(await db.query('SELECT * FROM ogden_practice_progress ORDER BY mode')).rows,events:(await db.query('SELECT * FROM ogden_practice_events ORDER BY mode')).rows});const before=await snapshot();
  const upgrade=structuredClone(c);upgrade.version='test-upgrade-v6';const word=upgrade.items.find(x=>x.id==='ow-close')!;word.version++;word.note='fixture: extra explanation';
  await installOgden(db,upgrade);await installOgden(db,upgrade);await prepareDatabase(db);assert.deepEqual(await snapshot(),before);
  const history=(await db.query("SELECT version FROM ogden_item_versions WHERE item_id='ow-close' ORDER BY version")).rows;assert.deepEqual(history.map((r:any)=>r.version),[c.items.find(x=>x.id==='ow-close')!.version,c.items.find(x=>x.id==='ow-close')!.version+1]);
  const review=await ogden({db,userId:user,path:'/api/ogden/review',method:'GET',body:{},query:new URLSearchParams('mode=listening')});assert.equal(review.items[0].status,'unmastered');
  const isolated=await ogden({db,userId:other,path:'/api/ogden/progress',method:'GET',body:{}});assert.deepEqual(isolated.progress,[]);assert.deepEqual(isolated.practice,[]);
 }finally{await cleanup();}
});
