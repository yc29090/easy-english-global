import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadOgden,validateOgden,OPERATORS} from '../src/ogden-content.ts';
import {installOgden} from '../src/install-ogden.ts';
import {ogden} from '../src/ogden.ts';
import {prepareDatabase} from '../src/setup.ts';
import {isolatedDatabase} from './test-db.ts';
import {createApplication} from '../src/http.ts';
const content=await loadOgden();
test('modern 850-word core remains traceable and contains the distinct 18 operators',async()=>{
 assert.equal(content.items.length,1165);assert.equal(content.items.filter(x=>x.reviewMethod==='developer-self-check'&&x.reviewStatus==='approved').length,1165);
 assert.deepEqual(content.items.filter(x=>x.kind==='operator').map(x=>x.english),OPERATORS);
 const raw=await readFile(new URL('../data/ogden/secondary-wordlist.txt',import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(raw).digest('hex'),content.sources[0].sha256);
 assert.equal(raw.trim().split('\n').length,852);
 for(const r of content.originalReferences.filter(r=>r.sourceId==='secondary-bnspalding')){assert.equal(raw.split('\n')[Number(r.sourceLocator.slice(5))-1],r.english);assert.equal(r.verification,'pending-primary-review');}
 for(const x of content.items.filter(x=>x.kind==='word'))assert.equal(typeof x.isOgdenOriginal,'boolean');
 for(const mutate of [(d:any)=>d.originalReferences.find((r:any)=>r.id===d.items[0].originalRef).verification='pending-primary-review',(d:any)=>d.items[1].id=d.items[0].id,(d:any)=>d.items.splice(d.items.findIndex((x:any)=>x.kind==='operator'),1),(d:any)=>d.items.find((x:any)=>x.kind==='combination').tokens=['bad'],(d:any)=>d.items[0].patternIds=['missing']]){
  const d=structuredClone(content);mutate(d);assert.throws(()=>validateOgden(d));
 }
 for(const x of content.items.filter(x=>x.kind==='expression')){assert.ok(x.answers.length>=2);assert.equal(x.evaluation,'self-assessment');}
});
test('legacy curriculum, billing, authentication, audio and deployment inputs remain byte-identical',async()=>{
 for(const file of ['data/curriculum.json','src/security.ts','src/config.ts','src/review.ts','src/setup.ts','src/install-content.ts','src/learning-v2.ts','public/playback.js','public/speech-practice.js','public/styles.css','render.yaml','.env.example','scripts/import.ts',...['001_init.sql','002_learning_method.sql','003_curriculum.sql','004_manual_payment.sql','005_manual_payment_safety.sql','006_gmail_oauth.sql','007_learning_v2.sql'].map(x=>'db/'+x)]){
  const baseline=JSON.parse(await readFile(new URL('../docs/ogden/legacy-baseline.json',import.meta.url),'utf8'));
  const bytes=await readFile(new URL('../'+file,import.meta.url));
  // This explicitly authorized UI change appends styles; the original CSS must stay intact.
  const marker=Buffer.from('\n/* Equal entry points: shared account and membership, independent learning histories. */');
  const boundary=file==='public/styles.css'?bytes.indexOf(marker):-1;
  if(file==='public/styles.css')assert.ok(boundary>0,'Classic CSS must precede the documented append-only version styles');
  assert.equal(createHash('sha256').update(boundary>0?bytes.subarray(0,boundary):bytes).digest('hex'),baseline.files[file],file);
 }
});
test('additive schema, repeat import, immutable versions and per-user isolated practice',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);
  const users=[randomUUID(),randomUUID()];for(const id of users)await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')",[id,id+'@example.invalid']);
  const legacy=async()=>({materials:(await db.query('SELECT * FROM materials ORDER BY id')).rows,scenes:(await db.query('SELECT * FROM scenes ORDER BY id')).rows,dialogues:(await db.query('SELECT * FROM curriculum_dialogues ORDER BY id')).rows,users:(await db.query('SELECT * FROM users ORDER BY id')).rows,progress:(await db.query('SELECT * FROM progress')).rows,orders:(await db.query('SELECT * FROM orders')).rows});
  const before=await legacy();await installOgden(db,content);
  const call=(userId:string,path:string,body:any={},method='GET')=>ogden({db,userId,path:'/api/ogden/'+path,body,method});
  const result={item_id:'ow-get',status:'unmastered',mode:'study',request_id:randomUUID()};
  await call(users[0],'results',result,'POST');assert.deepEqual(await call(users[0],'results',result,'POST'),{ok:true,duplicate:true});
  assert.equal((await call(users[0],'progress')).progress.length,1);assert.equal((await call(users[1],'progress')).progress.length,0);
  assert.equal((await call(users[1],'review')).items.length,0);assert.equal((await call(users[0],'review')).items[0].payload.id,'ow-get');
  await assert.rejects(()=>call(users[0],'results',{...result,status:'mastered'},'POST'),/请求编号/);
  await assert.rejects(()=>call(users[0],'results',{...result,user_id:users[1]},'POST'),/session/);
  await assert.rejects(()=>call(users[0],'results',{...result,item_id:'missing',request_id:randomUUID()},'POST'),/教材不存在/);
  await call(users[0],'results',{...result,item_id:'op-get',status:'mastered',request_id:randomUUID()},'POST');assert.equal((await call(users[0],'progress')).progress.length,1);
  for(const answer of ['When will the car get here?','When will the car arrive?','My own different words'])await call(users[0],'results',{item_id:'ex-arrival',status:'learned',mode:'express',request_id:randomUUID(),answer},'POST');
  const saved=(await call(users[0],'progress')).progress;await installOgden(db,content);assert.deepEqual((await call(users[0],'progress')).progress,saved);
  assert.equal((await db.query('SELECT * FROM ogden_practice_events')).rows.length,5);
  const changed=structuredClone(content);changed.items[0].chinese='改变';await assert.rejects(()=>installOgden(db,changed),/manifest version conflict/);
  changed.version='mbe-test-upgrade';await assert.rejects(()=>installOgden(db,changed),/item version conflict/);
  changed.items[0].version++;await installOgden(db,changed);assert.deepEqual((await call(users[0],'progress')).progress,saved);
  assert.equal((await db.query("SELECT * FROM ogden_item_versions WHERE item_id='ow-come'")).rows.length,2);
  assert.deepEqual(await legacy(),before);await prepareDatabase(db);assert.deepEqual(await legacy(),before);
 }finally{await cleanup();}
});
test('HTTP protects authentication, user identity, preview routes, CSRF and production policy',async()=>{
 const {db,cleanup}=await isolatedDatabase();await prepareDatabase(db);await installOgden(db,content);
 const config={production:false,appUrl:'http://127.0.0.1:3100',port:3100,mockCheckout:false,mailProvider:'disabled' as const,mailFrom:''};
 let server=createApplication({query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})},config,async()=>{});
 try{
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');let base='http://127.0.0.1:'+address.port;config.appUrl=base;
  const post=(path:string,body:any,cookie='')=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/ogden/catalog')).status,401);
  const registered=await post('/api/auth/register',{email:randomUUID()+'@example.invalid',password:'Preview9!Example'});assert.equal(registered.status,200);const cookie=registered.headers.get('set-cookie')!.split(';')[0];const user=(await registered.json()).user;
  assert.equal((await post('/api/auth/login',{email:user.email,password:'Preview9!Example'})).status,200);
  for(const path of ['/ogden','/ogden/words','/ogden/operators','/ogden/operators/get','/ogden/patterns','/ogden/build','/ogden/express','/ogden/listening','/ogden/speaking','/ogden/review','/ogden/progress','/ogden/app.js','/ogden/speech.js','/ogden/styles.css']){const r=await fetch(base+path);assert.equal(r.status,200,path);}
  assert.equal((await fetch(base+'/ogden/no-such-route')).status,404);assert.equal((await fetch(base+'/ogden',{method:'POST'})).status,404);
  assert.equal((await (await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).json()).items.length,content.items.length);
  const compressed=await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie,'Accept-Encoding':'gzip'}});assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.equal(compressed.headers.get('vary'),'Accept-Encoding');const text=await compressed.text();assert.equal(JSON.parse(text).coverage.coreWords,850);assert.ok(Number(compressed.headers.get('content-length'))<Buffer.byteLength(text)/2);
  const identity=await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie,'Accept-Encoding':'gzip;q=0'}});assert.equal(identity.headers.get('content-encoding'),null);assert.equal((await identity.json()).items.length,content.items.length);

  const result={item_id:'ow-get',status:'review',mode:'study',request_id:randomUUID()};assert.equal((await post('/api/ogden/results',result,cookie)).status,200);
  assert.equal((await post('/api/ogden/results',{...result,user_id:randomUUID()},cookie)).status,400);
  assert.equal((await fetch(base+'/api/ogden/results',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(result)})).status,403);
  await db.query('UPDATE users SET must_change_password=true WHERE id=$1',[user.id]);assert.equal((await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).status,403);
  server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));config.production=true;
  server=createApplication({query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})},config,async()=>{});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const prodAddress=server.address();assert.ok(prodAddress&&typeof prodAddress!=='string');base='http://127.0.0.1:'+prodAddress.port;config.appUrl=base;
  for(const path of ['/ogden','/ogden/app.js','/api/ogden/catalog','/api/ogden/progress','/api/ogden/review'])assert.equal((await fetch(base+path,{headers:{Cookie:cookie}})).status,404,path);
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/catalog')).status,200);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await cleanup();}
});
