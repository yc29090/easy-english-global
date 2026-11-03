import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {api} from '../src/api.ts';
import {prepareDatabase} from '../src/setup.ts';
import {migrate} from '../src/migrations.ts';
import {installLearningV2,learningSeed} from '../src/install-learning-v2.ts';
import {isolatedDatabase} from './test-db.ts';

test('V2 database: additive repeatable install, access control, isolated idempotent results and independent reviews',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 const call=(method:string,path:string,body:any={},session?:string)=>{const url=new URL('https://test.invalid/api'+path);return api({db,method,path:url.pathname,query:url.searchParams,body,session,ip:'v2-test',sendReset:async()=>{},appUrl:'https://test.invalid',mock:false});};
 const secret='Test9!'+randomUUID();
 try{
  await prepareDatabase(db);
  const a=await call('POST','/auth/register',{email:'first@example.com',password:secret}),b=await call('POST','/auth/register',{email:'other@example.com',password:secret});
  const free=(await db.query("SELECT * FROM materials WHERE is_free AND kind='phrase' ORDER BY id LIMIT 1")).rows[0];
  const paid=(await db.query("SELECT * FROM materials WHERE NOT is_free AND kind='phrase' ORDER BY id LIMIT 1")).rows[0];
  await call('PUT','/progress',{material_id:free.id,status:'unmastered'},a.session);
  const ordinary=(await db.query('SELECT * FROM progress WHERE user_id=$1',[a.user.id])).rows;
  await migrate(db);await installLearningV2(db);await prepareDatabase(db);
  assert.deepEqual((await db.query('SELECT * FROM progress WHERE user_id=$1',[a.user.id])).rows,ordinary);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM materials')).rows[0].n,700);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_word_links')).rows[0].n,learningSeed.wordLinks.length);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_dialogue_links')).rows[0].n,1000);
  await assert.rejects(()=>call('GET','/learning-v2/patterns'),{status:401});
  await assert.rejects(()=>call('GET','/learning-v2/links?material_id='+paid.id,{},a.session),{status:403});
  const links=await call('GET','/learning-v2/links?material_id='+free.id,{},a.session);assert.equal(links.source.id,free.id);assert.ok(links.materials.every((m:any)=>m.is_free));assert.ok(links.dialogues.every((d:any)=>d.is_free));
  const patterns=await call('GET','/learning-v2/patterns',{},a.session);assert.equal(patterns.variants.length,4);
  const paidVariant=learningSeed.variants.find(v=>!v.is_free)!;
  await assert.rejects(()=>call('POST','/learning-v2/results',{mode:'pattern',target_id:paidVariant.id,succeeded:true,request_id:randomUUID()},a.session),{status:403});
  const result={mode:'listening',target_id:free.id,succeeded:false,request_id:randomUUID()};
  const saved=await call('POST','/learning-v2/results',result,a.session);assert.ok(new Date(saved.next_review_at).getTime()>Date.now()+9*60000);
  assert.equal((await call('POST','/learning-v2/results',result,a.session)).duplicate,true);
  await assert.rejects(()=>call('POST','/learning-v2/results',{...result,succeeded:true},a.session),{status:409});
  await assert.rejects(()=>call('POST','/learning-v2/results',{...result,user_id:b.user.id},a.session),{status:400});
  await assert.rejects(()=>call('POST','/learning-v2/results',{...result,succeeded:'true'},a.session),{status:400});
  await call('POST','/learning-v2/results',result,b.session); // Same request UUID is isolated per user.
  assert.equal((await call('GET','/learning-v2/review?all=true',{},a.session)).exercises.length,1);
  assert.equal((await db.query('SELECT attempts FROM learning_exercise_progress WHERE user_id=$1',[a.user.id])).rows[0].attempts,1);
  assert.equal((await call('GET','/learning-v2/review',{},a.session)).exercises.length,0);
  const expressed={...result,mode:'expression',succeeded:true,request_id:randomUUID()};await call('POST','/learning-v2/results',expressed,a.session);
  const all=await call('GET','/learning-v2/review?all=true',{},a.session);assert.equal(all.exercises.length,2);assert.equal(all.exercises[0].mode,'listening');assert.ok(all.related.length>0);
  assert.equal((await call('GET','/learning-v2/review?all=true',{},b.session)).exercises.length,1);
  const analysis=await call('GET','/learning-v2/analytics',{},a.session);assert.equal(analysis.ordinary[0].studied,1);assert.equal(analysis.ordinary[0].unmastered,1);
  assert.equal(analysis.practice.find((r:any)=>r.mode==='listening').weak,1);assert.equal(analysis.practice.find((r:any)=>r.mode==='expression').successes,1);
  const otherAnalysis=await call('GET','/learning-v2/analytics',{},b.session);assert.equal(otherAnalysis.ordinary.length,0);assert.equal(otherAnalysis.practice.length,1);

  assert.deepEqual((await db.query('SELECT * FROM progress WHERE user_id=$1',[a.user.id])).rows,ordinary);
  await call('POST','/learning-v2/results',{mode:'pattern',target_id:patterns.variants[0].id,succeeded:false,request_id:randomUUID()},a.session);
  assert.equal((await call('GET','/learning-v2/review?all=true&mode=pattern',{},a.session)).exercises.length,1);
  await db.query("UPDATE users SET membership='trial',trial_until=now()+interval '1 hour' WHERE id=$1",[a.user.id]);
  assert.equal((await call('GET','/learning-v2/patterns',{},a.session)).variants.length,20);
  await call('POST','/learning-v2/results',{...result,target_id:paid.id,request_id:randomUUID()},a.session);
  await db.query("UPDATE users SET trial_until=now()-interval '1 hour' WHERE id=$1",[a.user.id]);
  assert.ok((await call('GET','/learning-v2/review?all=true',{},a.session)).exercises.every((e:any)=>e.target_id!==paid.id));
  await assert.rejects(()=>call('POST','/learning-v2/results',{...result,target_id:paid.id,request_id:randomUUID()},a.session),{status:403});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_exercise_events WHERE user_id=$1 AND material_id=$2',[a.user.id,paid.id])).rows[0].n,1);
  const requestId=randomUUID(),failing={query:async(sql:string,values?:any[])=>{if(sql.startsWith('INSERT INTO learning_exercise_progress'))throw new Error('Synthetic learning write failure');return db.query(sql,values);}};
  const {learningV2}=await import('../src/learning-v2.ts');
  await assert.rejects(()=>learningV2({db:failing,user:b.user,method:'POST',path:'/api/learning-v2/results',body:{mode:'expression',target_id:free.id,succeeded:false,request_id:requestId},query:new URLSearchParams()}),/Synthetic learning write failure/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_exercise_events WHERE user_id=$1 AND request_id=$2',[b.user.id,requestId])).rows[0].n,0);
  await db.query('UPDATE users SET disabled=true WHERE id=$1',[a.user.id]);await assert.rejects(()=>call('GET','/learning-v2/patterns',{},a.session),{status:401});
 }finally{await cleanup();}
});

test('V2 PostgreSQL: concurrent identical saves count once with per-user serialization',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {db,cleanup}=await isolatedDatabase();const clients:any[]=[];
 try{
  await prepareDatabase(db);const {randomUUID}=await import('node:crypto');
  const id=randomUUID(),{hashPassword}=await import('../src/security.ts');
  await db.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[id,'concurrent-v2@example.com',await hashPassword('Concurrency9!'+randomUUID())]);
  const target=(await db.query('SELECT id FROM materials WHERE is_free LIMIT 1')).rows[0].id;
  const schema=(await db.query('SELECT current_schema() AS schema')).rows[0].schema;assert.match(schema,/^ee_runtime_[a-z0-9]+$/);
  const {default:pg}=await import('pg');
  for(let i=0;i<2;i++){const client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();await client.query('SET search_path TO '+schema);clients.push(client);}
  const {learningV2}=await import('../src/learning-v2.ts'),request_id=randomUUID(),body={request_id,mode:'listening',target_id:target,succeeded:false};
  const results=await Promise.all(clients.map(client=>learningV2({db:client,user:{id,membership:'free'},method:'POST',path:'/api/learning-v2/results',body,query:new URLSearchParams()})));
  assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal((await db.query('SELECT attempts FROM learning_exercise_progress WHERE user_id=$1',[id])).rows[0].attempts,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_exercise_events WHERE user_id=$1',[id])).rows[0].n,1);
 }finally{await Promise.all(clients.map(c=>c.end()));await cleanup();}
});
