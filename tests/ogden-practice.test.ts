import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadOgden,OPERATORS,validateOgden} from '../src/ogden-content.ts';
import {ogden} from '../src/ogden.ts';
import {prepareDatabase} from '../src/setup.ts';
import {installOgden} from '../src/install-ogden.ts';
import {migrations} from '../src/migrations.ts';
import {isolatedDatabase} from './test-db.ts';
const c=await loadOgden();
async function learner(db:any){const id=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[id,id+'@example.invalid']);return id;}
test('850 headwords, 12 functional domains, 18 complete operator families and one selected American dictionary reading',async()=>{
 const words=c.items.filter(x=>x.kind==='word'),combos=c.items.filter(x=>x.kind==='combination'),tasks=c.items.filter(x=>x.kind==='expression');
 assert.equal(words.length,850);assert.equal(combos.length,109);assert.equal(tasks.length,140);assert.equal(c.domains.length,12);
 for(const domain of c.domains)assert.ok(tasks.filter(x=>x.domain===domain.id).length>=3,domain.id);
 for(const op of OPERATORS){const family=combos.filter(x=>x.operatorWordId==='ow-'+op);assert.ok(family.length>=3,op);assert.deepEqual(new Set(c.items.find(x=>x.id==='op-'+op)!.practiceCombinationIds),new Set(family.map(x=>x.id)));}
 assert.ok(!words.some(x=>x.english==='people'),'irregular plural must not pad core count');assert.equal(c.wordForms.people,'person');
 const dictionary=JSON.parse(await readFile(new URL('../data/ogden/pronunciation.json',import.meta.url),'utf8'));
 for(const w of words){assert.deepEqual(dictionary.entries[w.english],{entry:w.pronunciation.dictionaryEntry,arpabet:w.pronunciation.arpabet});assert.equal(w.pronunciation.locale,'en-US');}
 assert.equal(dictionary.entries.read.arpabet,'R IY1 D');assert.equal(dictionary.entries.live.arpabet,'L IH1 V');assert.equal(dictionary.entries.use.arpabet,'Y UW1 Z');
 assert.deepEqual(await readFile(new URL('../data/ogden/licenses/CMUDICT.txt',import.meta.url)),await readFile(new URL('../public/ogden/CMUDICT-LICENSE.txt',import.meta.url)));
 for(const damage of ['family','domain','phonemes','dictionary-source','form']){const bad=structuredClone(c);if(damage==='family')bad.items.find(x=>x.id==='op-let')!.practiceCombinationIds=[];if(damage==='domain')bad.items.find(x=>x.kind==='expression')!.domain='invented';if(damage==='phonemes')bad.items.find(x=>x.kind==='word')!.pronunciation.arpabet='';if(damage==='dictionary-source')bad.items.find(x=>x.kind==='word')!.pronunciation.dictionarySource='missing';if(damage==='form')bad.wordForms.people='missing';assert.throws(()=>validateOgden(bad));}
});
test('listening weakness survives speaking mastery; review filters, early review and analytics are user-isolated',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);await installOgden(db,c);const user=await learner(db),other=await learner(db);
  const call=(userId:string,path:string,body:any={},query='',method='GET')=>ogden({db,userId,path:'/api/ogden/'+path,body,query:new URLSearchParams(query),method});
  const failed={item_id:'ow-get',mode:'listening',status:'unmastered',request_id:randomUUID()};await call(user,'results',failed,'','POST');await call(user,'results',failed,'','POST');
  await call(user,'results',{item_id:'ow-get',mode:'speaking',status:'mastered',request_id:randomUUID()},'','POST');
  assert.equal((await call(user,'progress')).progress.length,1);assert.equal((await call(user,'progress')).progress[0].status,'mastered');
  assert.equal((await call(user,'review',{},'mode=listening')).items[0].status,'unmastered');assert.equal((await call(user,'review',{},'mode=speaking')).items.length,0);
  assert.equal((await call(user,'review',{},'mode=speaking&all=true')).items.length,1);assert.equal((await call(user,'review',{},'kind=operator')).items.length,1);
  assert.deepEqual((await call(user,'review')).items[0].review_modes,['listening']);
  const analytics=await call(user,'analytics');assert.equal(analytics.shared[0].mastered,1);assert.equal(analytics.practice.find((x:any)=>x.mode==='listening').attempts,1);assert.equal(analytics.practice.find((x:any)=>x.mode==='listening').weak,1);
  assert.equal((await call(other,'analytics')).practice.length,0);assert.equal((await call(other,'review',{},'mode=listening&all=true')).items.length,0);
  assert.equal((await call(user,'review',{},'status=unmastered')).items.length,1);assert.equal((await call(user,'review',{},'mode=speaking&status=unmastered&all=true')).items.length,0);assert.equal((await call(user,'review',{},'status=review')).items.length,0);await assert.rejects(()=>call(user,'review',{},'status=made-up'),/Invalid review filter/);
  await assert.rejects(()=>call(user,'review',{},'mode=bad'),/Invalid review filter/);await assert.rejects(()=>call(user,'review',{},'kind=bad'),/Invalid review filter/);
  await call(user,'results',{...failed,status:'mastered',request_id:randomUUID()},'','POST');assert.equal((await call(user,'review')).items.length,0);
 }finally{await cleanup();}
});
test('009 backfills existing per-mode history idempotently and leaves shared state and events untouched',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  for(const name of migrations.filter(x=>!x.startsWith('009_')))await db.query(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));
  await installOgden(db,c);const id=await learner(db),target='ow-get';
  await db.query("INSERT INTO ogden_progress(user_id,item_id,status,next_review_at) VALUES($1,$2,'mastered','2099-01-01')",[id,target]);
  const version=c.items.find(x=>x.id===target)!.version;
  for(const [mode,status,date] of [['listening','learned','2026-01-01'],['listening','unmastered','2026-01-02'],['speaking','mastered','2026-01-03']])await db.query('INSERT INTO ogden_practice_events(user_id,request_id,item_id,item_version,mode,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,randomUUID(),target,version,mode,status,date]);
  const before=(await db.query('SELECT * FROM ogden_progress')).rows,events=(await db.query('SELECT * FROM ogden_practice_events ORDER BY created_at')).rows;
  const sql=await readFile(new URL('../db/009_ogden_practice_progress.sql',import.meta.url),'utf8');await db.query(sql);await db.query(sql);
  assert.deepEqual((await db.query('SELECT * FROM ogden_progress')).rows,before);assert.deepEqual((await db.query('SELECT * FROM ogden_practice_events ORDER BY created_at')).rows,events);
  const rows=(await db.query('SELECT mode,status,attempts FROM ogden_practice_progress ORDER BY mode')).rows;assert.deepEqual(rows,[{mode:'listening',status:'unmastered',attempts:2},{mode:'speaking',status:'mastered',attempts:1}]);
 }finally{await cleanup();}
});
test('PostgreSQL concurrent retries increment per-mode attempts only once',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {db,cleanup}=await isolatedDatabase();const {default:pg}=await import('pg');const second=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});try{
  await prepareDatabase(db);await installOgden(db,c);const id=await learner(db),schema=(await db.query('SELECT current_schema() AS name')).rows[0].name;assert.match(schema,/^ee_runtime_[a-f0-9]+$/);
  await second.connect();await second.query('SET search_path TO '+schema);
  const body={item_id:'ow-get',mode:'listening',status:'mastered',request_id:randomUUID()},call=(connection:any)=>ogden({db:connection,userId:id,path:'/api/ogden/results',method:'POST',body});
  const results=await Promise.all([call(db),call(second)]);assert.equal(results.filter(x=>x.duplicate).length,1);
  assert.equal((await db.query('SELECT attempts FROM ogden_practice_progress')).rows[0].attempts,1);assert.equal((await db.query('SELECT count(*)::int n FROM ogden_practice_events')).rows[0].n,1);
 }finally{await second.end();await cleanup();}
});
