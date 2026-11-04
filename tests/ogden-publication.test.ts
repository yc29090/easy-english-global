import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadOgden} from '../src/ogden-content.ts';
import {installOgden} from '../src/install-ogden.ts';
import {ogden} from '../src/ogden.ts';
import {ogdenPublished,prepareOgdenPublication,ogdenPublicationReady} from '../src/ogden-publication.ts';
import {prepareDatabase} from '../src/setup.ts';
import {createApplication} from '../src/http.ts';
import {isolatedDatabase} from './test-db.ts';

test('publication switch is explicit, default-closed and rejects ambiguous environment values',()=>{
 assert.equal(ogdenPublished({}),false);assert.equal(ogdenPublished({OGDEN_PUBLISHED:'false'}),false);
 assert.equal(ogdenPublished({OGDEN_PUBLISHED:'true'}),true);
 for(const value of ['','1','TRUE',' true ','yes'])assert.throws(()=>ogdenPublished({OGDEN_PUBLISHED:value}),/OGDEN_PUBLISHED/);
});

test('published production imports reviewed content, checks readiness, preserves history and enforces original membership with safe close',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 const pool={query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})};
 const config={production:true,appUrl:'http://127.0.0.1',port:3000,mockCheckout:false,mailProvider:'disabled' as const,mailFrom:''};
 const options={ogdenPublished:true};const server=createApplication(pool,config,async()=>{},undefined,undefined,options);
 try{
  await prepareDatabase(db);await prepareOgdenPublication(db,false);
  assert.equal((await db.query('SELECT count(*)::int n FROM ogden_items')).rows[0].n,0);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base='http://127.0.0.1:'+addr.port;config.appUrl=base;
  assert.equal((await fetch(base+'/health')).status,503);
  assert.equal((await fetch(base+'/api/ogden/catalog')).status,401);
  assert.equal((await prepareOgdenPublication(db,true)).installed,true);assert.equal(await ogdenPublicationReady(db),true);
  assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/ogden')).status,200);
  const post=(path:string,body:any,cookie='')=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  const registered=await post('/api/auth/register',{email:randomUUID()+'@example.invalid',password:'Publication9!fixture'});assert.equal(registered.status,200);
  let cookie=registered.headers.get('set-cookie')!.split(';')[0];const user=(await registered.json()).user;
  assert.equal((await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).status,403);
  await db.query("UPDATE users SET role='admin' WHERE id=$1",[user.id]);
  assert.equal((await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).status,403,'administrator role cannot bypass membership');
  await db.query("UPDATE users SET membership='lifetime' WHERE id=$1",[user.id]);
  const catalog=await(await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).json();
  assert.equal(catalog.items.length,1165);assert.equal(catalog.coverage.coreWords,850);assert.equal(catalog.preview,false);assert.equal(catalog.entitlement.productionEnabled,true);assert.equal(catalog.entitlement.additionalChargeCny,0);assert.equal(catalog.release,'published-modern-basic-english');
  await db.query("UPDATE ogden_items SET review_status='draft' WHERE id='ow-get'");
  assert.equal((await fetch(base+'/health')).status,503);
  const restricted=await(await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).json();assert.ok(!restricted.items.some((x:any)=>['ow-get','op-get'].includes(x.id)));
  await db.query("UPDATE ogden_items SET review_status='approved' WHERE id='ow-get'");
  const result={item_id:'ow-get',mode:'listening',status:'unmastered',request_id:randomUUID()};
  assert.equal((await post('/api/ogden/results',result,cookie)).status,200);assert.equal((await(await post('/api/ogden/results',result,cookie)).json()).duplicate,true);
  const combinations=catalog.items.find((x:any)=>x.kind==='combination'),expression=catalog.items.find((x:any)=>x.kind==='expression');
  for(const [mode,item_id] of [['study','ow-get'],['speaking','ow-get'],['build',combinations.id],['express',expression.id]]){
   assert.equal((await post('/api/ogden/results',{item_id,mode,status:'mastered',request_id:randomUUID()},cookie)).status,200);
  }
  const get=(path:string,session=cookie)=>fetch(base+path,{headers:{Cookie:session}});
  const analytics=await(await get('/api/ogden/analytics')).json();assert.equal(analytics.practice.length,5);assert.equal(analytics.shared.find((x:any)=>x.kind==='word').studied,1);
  const review=await(await get('/api/ogden/review?mode=listening')).json();assert.ok(review.items.some((x:any)=>x.payload.id==='ow-get'&&x.status==='unmastered'));
  const state=(await db.query('SELECT * FROM ogden_practice_progress WHERE user_id=$1 ORDER BY item_id,mode',[user.id])).rows;
  const progressBefore=await(await get('/api/ogden/progress')).json();
  assert.equal((await post('/api/auth/logout',{},cookie)).status,200);assert.equal((await get('/api/ogden/progress')).status,401);
  const login=await post('/api/auth/login',{email:user.email,password:'Publication9!fixture'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
  assert.deepEqual(await(await get('/api/ogden/progress')).json(),progressBefore);
  const other=await post('/api/auth/register',{email:randomUUID()+'@example.invalid',password:'Other9!publication'}),otherCookie=other.headers.get('set-cookie')!.split(';')[0],otherUser=(await other.json()).user;
  await db.query("UPDATE users SET membership='lifetime' WHERE id=$1",[otherUser.id]);
  const otherProgress=await(await get('/api/ogden/progress',otherCookie)).json();assert.deepEqual(otherProgress.progress,[]);assert.deepEqual(otherProgress.practice,[]);assert.notEqual(otherProgress.ownerId,user.id);
  const legacy=await(await get('/api/catalog')).json();assert.equal(legacy.materials.filter((x:any)=>x.kind==='word').length,500);assert.equal(legacy.materials.filter((x:any)=>x.kind==='phrase').length,200);assert.equal(legacy.scenes.length,20);assert.ok(legacy.dialogues.length>=100);assert.equal(legacy.features.mockCheckout,false);
  assert.equal((await prepareOgdenPublication(db,true)).installed,false);
  assert.deepEqual((await db.query('SELECT * FROM ogden_practice_progress WHERE user_id=$1 ORDER BY item_id,mode',[user.id])).rows,state);
  assert.equal((await db.query('SELECT count(*)::int n FROM progress WHERE user_id=$1',[user.id])).rows[0].n,0);
  await db.query("UPDATE users SET membership='trial',trial_until=now()-interval '1 second' WHERE id=$1",[user.id]);
  assert.equal((await fetch(base+'/api/ogden/progress',{headers:{Cookie:cookie}})).status,403);
  await db.query("UPDATE users SET trial_until=now()+interval '1 day' WHERE id=$1",[user.id]);assert.equal((await fetch(base+'/api/ogden/progress',{headers:{Cookie:cookie}})).status,200);
  options.ogdenPublished=false;
  for(const path of ['/ogden','/ogden/app.js','/api/ogden/catalog','/api/ogden/results','/ogden?OGDEN_PUBLISHED=true&preview=true','/api/ogden/catalog?preview=true'])assert.equal((await fetch(base+path,{headers:{Cookie:cookie,'X-OGDEN-PUBLISHED':'true'}})).status,404);
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/catalog')).status,200);
  assert.deepEqual((await db.query('SELECT * FROM ogden_practice_progress WHERE user_id=$1 ORDER BY item_id,mode',[user.id])).rows,state);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await cleanup();}
});

test('publication import failure rolls back all 2.0 content, keeps readiness false and can retry without resetting accounts',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);const id=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture-only')",[id,id+'@example.invalid']);
  const before=(await db.query('SELECT * FROM users ORDER BY id')).rows;
  const faulty={query:async(sql:string,v?:any[])=>{if(sql.startsWith('INSERT INTO ogden_content_reviews'))throw Error('synthetic import interruption');return db.query(sql,v);}};
  await assert.rejects(()=>prepareOgdenPublication(faulty,true),/synthetic import interruption/);
  assert.equal(await ogdenPublicationReady(db),false);assert.equal((await db.query('SELECT count(*)::int n FROM ogden_items')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM ogden_installs')).rows[0].n,0);
  assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows,before);
  assert.equal((await prepareOgdenPublication(db,true)).installed,true);assert.equal(await ogdenPublicationReady(db),true);assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows,before);
 }finally{await cleanup();}
});

test('publication readiness rejects version drift even when install hash, approved count and current reviews still match',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);await prepareOgdenPublication(db,true);assert.equal(await ogdenPublicationReady(db),true);
  const item=(await db.query("SELECT * FROM ogden_items WHERE id='ow-get'")).rows[0];
  const version=item.version+100;
  await db.query('INSERT INTO ogden_item_versions VALUES($1,$2,$3)',[item.id,version,JSON.stringify({...item.payload,version})]);
  await db.query("INSERT INTO ogden_content_reviews(id,item_id,version,status,reviewer,notes) VALUES('round6-version-fixture',$1,$2,'approved','test fixture, not a human reviewer','test-only version drift')",[item.id,version]);
  await db.query('UPDATE ogden_items SET version=$1 WHERE id=$2',[version,item.id]);
  assert.equal(await ogdenPublicationReady(db),false);
  await assert.rejects(()=>prepareOgdenPublication(db,true),/not ready/,'a stale application must not downgrade newer content or claim readiness');
  assert.equal((await db.query('SELECT version FROM ogden_items WHERE id=$1',[item.id])).rows[0].version,version);
  assert.equal((await db.query('SELECT count(*)::int n FROM ogden_item_versions WHERE item_id=$1',[item.id])).rows[0].n,2);
 }finally{await cleanup();}
});

test('actual v7 seem teaching history and review survive the v8 correction without changing learner records',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);const current=await loadOgden();
  const fixture=JSON.parse(await readFile(new URL('./fixtures/ogden-v7-seem.json',import.meta.url),'utf8'));
  const previous=structuredClone(current);previous.version=fixture.contentVersion;previous.items[previous.items.findIndex(x=>x.id==='op-seem')]=fixture.item;
  const oldReviews=JSON.parse(await readFile(new URL('../data/ogden/review-history/mbe-modern-850-v7-final-audit.json',import.meta.url),'utf8'));
  await installOgden(db,previous,oldReviews);const id=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture-only')",[id,id+'@example.invalid']);
  await ogden({db,userId:id,method:'POST',path:'/api/ogden/results',body:{item_id:'ow-seem',mode:'study',status:'mastered',request_id:randomUUID()}});
  const snapshot=async()=>({progress:(await db.query('SELECT * FROM ogden_progress')).rows,practice:(await db.query('SELECT * FROM ogden_practice_progress')).rows,events:(await db.query('SELECT * FROM ogden_practice_events')).rows});const before=await snapshot();
  const oldReview=(await db.query('SELECT * FROM ogden_content_reviews WHERE item_id=$1 AND version=$2',['op-seem',fixture.item.version])).rows;
  const reviews=JSON.parse(await readFile(new URL('../data/ogden/reviews.json',import.meta.url),'utf8'));await installOgden(db,current,reviews);await installOgden(db,current,reviews);
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual((await db.query('SELECT * FROM ogden_content_reviews WHERE item_id=$1 AND version=$2',['op-seem',fixture.item.version])).rows,oldReview);
  assert.deepEqual((await db.query('SELECT payload FROM ogden_item_versions WHERE item_id=$1 AND version=$2',['op-seem',fixture.item.version])).rows[0].payload,fixture.item);
  const next=(await db.query("SELECT * FROM ogden_items WHERE id='op-seem'")).rows[0];assert.equal(next.version,fixture.item.version+1);assert.match(next.payload.note,/seem to be/);assert.doesNotMatch(next.payload.note,/不要加 be/);
 }finally{await cleanup();}
});
