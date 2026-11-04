import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadOgden,validateOgden,type OgdenItem} from '../src/ogden-content.ts';
import {contentDigest,reviewDigest,ogdenReadiness,ogdenReviewQueue} from '../src/ogden-readiness.ts';
import {prepareDatabase} from '../src/setup.ts';
import {installOgden} from '../src/install-ogden.ts';
import {ogden} from '../src/ogden.ts';
import {isolatedDatabase} from './test-db.ts';
const c=await loadOgden();
test('controlled variants are authored, unique, bilingual and cannot bypass draft review',()=>{
 assert.equal(c.items.reduce((n,x)=>n+(x.variants?.length||0),0),69);
 for(const change of ['missing','duplicate','untranslated','unreviewed']){
  const d=structuredClone(c),p=d.items.find(x=>x.kind==='pattern')!;
  if(change==='missing')p.variants=[];
  if(change==='duplicate')p.variants[1].id=p.variants[0].id;
  if(change==='untranslated')p.variants[1].chinese='';
  if(change==='unreviewed')p.variants[0].reviewStatus='draft';
  assert.throws(()=>validateOgden(d));
 }
});
test('readiness requires version-bound review evidence and never grants deployment access',async()=>{
 const exported=JSON.parse(await readFile(new URL('../docs/ogden/review-queue.json',import.meta.url),'utf8'));assert.equal(exported.contentDigest,contentDigest(c));assert.deepEqual(exported.items,ogdenReviewQueue(c));
 const r=ogdenReadiness(c,{});assert.equal(r.readyForProduction,false);assert.equal(r.checksPassed,false);assert.equal(r.checks.length,5);
 assert.equal(r.counts.authoredVariants,69);assert.equal(r.counts.approved,373);
 const queue=ogdenReviewQueue(c);assert.equal(queue.length,373);assert.ok(queue.every(x=>x.humanReviewer===null&&x.decision==='pending'));assert.equal(queue[0].digest,reviewDigest(c.items[0]));
 assert.equal(contentDigest({a:1,b:2}),contentDigest({b:2,a:1}));
 const approved=structuredClone(c);approved.items.forEach(x=>{x.reviewStatus='approved';for(const v of x.variants||[])v.reviewStatus='approved';});
 assert.equal(ogdenReadiness(approved,{}).checks[0].passed,false,'JSON status is not a human review record');
 const evidence=approved.items.map(x=>({id:x.id,version:x.version,digest:reviewDigest(x),notes:'test-only evidence',reviewedAt:'2026-11-04T00:00:00Z',humanReviewer:'test fixture only',decision:'approved'}));
 assert.equal(ogdenReadiness(approved,{},evidence).checks[0].passed,true);
 assert.equal(reviewDigest(approved.items[0]),queue[0].digest,'approval metadata does not change reviewed teaching content');
 approved.items[0].version++;assert.equal(ogdenReadiness(approved,{},evidence).checks[0].passed,false,'old reviews do not approve updated material');
});
test('provenance cannot be silently overwritten; retired words cannot be practiced via operator aliases',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);await installOgden(db,c);
  for(const type of ['source','reference']){
   const changed=structuredClone(c);changed.version='new-'+type;
   if(type==='source')changed.sources[0].url='https://example.invalid/changed';else changed.originalReferences[0].sourceLocator='line 999';
   await assert.rejects(()=>installOgden(db,changed),/identity conflict/);
  }
  const userId=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[userId,userId+'@example.invalid']);
  const call=(path:string,body:any={},method='GET')=>ogden({db,userId,path:'/api/ogden/'+path,body,method});
  await call('results',{item_id:'ow-get',mode:'study',status:'review',request_id:randomUUID()},'POST');
  const retired=structuredClone(c);retired.version='retirement-test';const item=retired.items.find(x=>x.id==='ow-get')!;item.version++;item.reviewStatus='retired';await installOgden(db,retired);
  assert.equal((await call('catalog')).items.some((x:any)=>['ow-get','op-get'].includes(x.id)),false);assert.equal((await call('review')).items.length,0);
  assert.equal((await call('progress')).progress.length,1,'retirement retains historical progress');
  await assert.rejects(()=>call('results',{item_id:'op-get',mode:'study',status:'learned',request_id:randomUUID()},'POST'),/教材不存在/);
 }finally{await cleanup();}
});
test('v1 stored pattern and practice history survive installation of v2 controlled variants',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);
  const userId=randomUUID(),pattern=c.items.find(x=>x.id==='pt-need')!,prior:OgdenItem={...pattern,version:1};delete prior.variants;
  await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[userId,userId+'@example.invalid']);
  await db.query('INSERT INTO ogden_items VALUES($1,$2,1,$3,$4)',[prior.id,prior.kind,JSON.stringify(prior),'draft']);
  await db.query('INSERT INTO ogden_item_versions VALUES($1,1,$2)',[prior.id,JSON.stringify(prior)]);
  await db.query("INSERT INTO ogden_progress(user_id,item_id,status,next_review_at) VALUES($1,$2,'mastered',now())",[userId,prior.id]);
  await db.query("INSERT INTO ogden_practice_events(user_id,request_id,item_id,item_version,mode,status) VALUES($1,$2,$3,1,'study','mastered')",[userId,randomUUID(),prior.id]);
  const progress=(await db.query('SELECT * FROM ogden_progress')).rows,events=(await db.query('SELECT * FROM ogden_practice_events')).rows;
  await installOgden(db,c);await installOgden(db,c);
  assert.deepEqual((await db.query('SELECT * FROM ogden_progress')).rows,progress);assert.deepEqual((await db.query('SELECT * FROM ogden_practice_events')).rows,events);
  const versions=(await db.query('SELECT version FROM ogden_item_versions WHERE item_id=$1 ORDER BY version',[prior.id])).rows;assert.deepEqual(versions.map(x=>x.version),[1,pattern.version]);
  assert.equal((await db.query('SELECT payload FROM ogden_items WHERE id=$1',[prior.id])).rows[0].payload.variants.length,3);
 }finally{await cleanup();}
});
