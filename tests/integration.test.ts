import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {api} from '../src/api.ts';
import {migrate} from '../src/migrations.ts';
import {dialogues} from '../src/dialogues.ts';
import {hashPassword} from '../src/security.ts';
import type {DB} from '../src/db.ts';
// PGlite runs the real PostgreSQL engine in-process. DATABASE_URL runs the same suite on PostgreSQL 16 in CI.
test('PostgreSQL: account lifecycle, ownership, expiry, admin, reset and mock orders',async()=>{
 let db:DB,close:()=>Promise<void>;
 if(process.env.TEST_DATABASE_URL){const {default:pg}=await import('pg');const client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();db=client;close=()=>client.end();}
 else{const {PGlite}=await import('@electric-sql/pglite');const engine=new PGlite();db={query:async(sql,v)=>{if(!v&&sql.includes(';')){await engine.exec(sql);return {rows:[]};}const r=await engine.query(sql,v);return {rows:r.rows as any[],rowCount:r.affectedRows};}};close=()=>engine.close();await engine.exec(await readFile(new URL('../db/001_init.sql',import.meta.url),'utf8'));}
 try{
  if(process.env.TEST_DATABASE_URL)await db.query(await readFile(new URL('../db/001_init.sql',import.meta.url),'utf8'));
  // Simulate upgrading a populated v1 database; these rows must survive unchanged.
  const legacy=randomUUID(),legacyScene='legacy-scene-'+legacy,legacyMaterial='legacy-material-'+legacy;
  await db.query("INSERT INTO users(id,email,password_hash,membership) VALUES($1,$2,'legacy-hash','lifetime')",[legacy,'legacy-'+legacy+'@example.com']);
  await db.query("INSERT INTO scenes VALUES($1,'Legacy','旧场景','life')",[legacyScene]);
  await db.query("INSERT INTO materials(id,kind,english,chinese,scene_id,is_free) VALUES($1,'word',$2,'旧教材',$3,true)",[legacyMaterial,legacyMaterial,legacyScene]);
  await db.query("INSERT INTO progress(user_id,material_id,status) VALUES($1,$2,'unmastered')",[legacy,legacyMaterial]);
  await migrate(db);
  const preserved=(await db.query('SELECT * FROM progress WHERE user_id=$1',[legacy])).rows[0];
  assert.equal(preserved.status,'unmastered');assert.ok(preserved.next_review_at);
  const originalDate=new Date(preserved.next_review_at).toISOString();await migrate(db);
  assert.equal(new Date((await db.query('SELECT * FROM progress WHERE user_id=$1',[legacy])).rows[0].next_review_at).toISOString(),originalDate);
  assert.equal((await db.query('SELECT * FROM users WHERE id=$1',[legacy])).rows[0].membership,'lifetime');
  let ip=0;const resetUrls:string[]=[];
  const call=(method:string,path:string,body:any={},session?:string,mock=true)=>api({db,method,path:'/api'+path,body,session,ip:'integration-'+(++ip),appUrl:'https://example.com',mock,sendReset:async(_email,url)=>{resetUrls.push(url);}});
  const suffix=randomUUID(),address='learner-'+suffix+'@example.com',secret='a-secure-password-123';
  const a=await call('POST','/auth/register',{email:address,password:secret});assert.equal(a.user.membership,'free');assert.ok(a.session);
  await assert.rejects(()=>call('POST','/auth/register',{email:address,password:secret}),{status:409});
  await assert.rejects(()=>call('POST','/auth/login',{email:address,password:'incorrect'}),{status:401});
  const login=await call('POST','/auth/login',{email:address,password:secret});assert.equal(login.user.id,a.user.id);
  const adminId=randomUUID();await db.query("INSERT INTO users(id,email,password_hash,role,membership) VALUES($1,$2,$3,'admin','lifetime')",[adminId,'admin-'+suffix+'@example.com',await hashPassword(secret)]);
  const admin=await call('POST','/auth/login',{email:'admin-'+suffix+'@example.com',password:secret});
  await assert.rejects(()=>call('POST','/admin/trials',{email:'trial@example.com',days:7},a.session),{status:403});
  await assert.rejects(()=>call('POST','/admin/trials',{email:'trial@example.com',days:91},admin.session),{status:400});
  const trial=await call('POST','/admin/trials',{email:'trial-'+suffix+'@example.com',days:7},admin.session);assert.ok(trial.temporaryPassword);assert.equal(trial.user.must_change_password,true);
  const trialSession=await call('POST','/auth/login',{email:trial.user.email,password:trial.temporaryPassword});await assert.rejects(()=>call('GET','/progress',{},trialSession.session),{status:403});
  await call('POST','/auth/password',{current:trial.temporaryPassword,password:secret},trialSession.session);await assert.rejects(()=>call('GET','/me',{},trialSession.session),{status:401});
  const changed=await call('POST','/auth/login',{email:trial.user.email,password:secret});assert.equal(changed.user.must_change_password,false);
  const sceneId='scene-'+suffix,freeId='free-'+suffix,paidId='paid-'+suffix;
  await db.query("INSERT INTO scenes VALUES($1,'Test only','仅用于测试','life')",[sceneId]);
  await db.query("INSERT INTO materials(id,kind,english,chinese,scene_id,is_free) VALUES($1,'word',$2,'测试',$3,true),($4,'phrase',$5,'测试短句',$3,false)",[freeId,'test-only-'+suffix,sceneId,paidId,'paid-test-only-'+suffix]);
  const catalog=await call('GET','/catalog');assert.ok(catalog.materials.some((m:any)=>m.id===freeId));assert.ok(!catalog.materials.some((m:any)=>m.id===paidId));
  await call('PUT','/progress',{material_id:freeId,status:'learned'},a.session);await assert.rejects(()=>call('PUT','/progress',{material_id:paidId,status:'mastered'},a.session),{status:403});
  await call('PUT','/progress',{material_id:paidId,status:'review'},changed.session);
  assert.ok((await call('GET','/progress',{},a.session)).progress[0].next_review_at);
  assert.equal((await call('GET','/review',{},a.session)).items.length,0);
  assert.equal((await call('GET','/review/all',{},a.session)).items.length,1);
  assert.equal((await call('GET','/learning-state',{},a.session)).state.last_material_id,freeId);
  await assert.rejects(()=>call('PUT','/learning-state',{material_id:paidId},a.session),{status:403});
  await call('PUT','/learning-state',{material_id:paidId},changed.session);
  assert.equal((await call('GET','/learning-state',{},changed.session)).state.last_material_id,paidId);
  // Two due states: unmastered must sort before review, even if reviewed more recently.
  await call('PUT','/progress',{material_id:freeId,status:'unmastered'},changed.session);
  await db.query("UPDATE progress SET next_review_at=now()-interval '1 minute' WHERE user_id=$1",[changed.user.id]);
  const due=await call('GET','/review',{},changed.session);assert.deepEqual(due.items.map((m:any)=>m.id),[freeId,paidId]);
  await call('PUT','/progress',{material_id:freeId,status:'mastered'},changed.session);
  const firstMastered=(await call('GET','/progress',{},changed.session)).progress.find((p:any)=>p.material_id===freeId);
  await call('PUT','/progress',{material_id:freeId,status:'mastered'},changed.session);
  const twiceMastered=(await call('GET','/progress',{},changed.session)).progress.find((p:any)=>p.material_id===freeId);
  assert.equal(twiceMastered.mastery_streak,2);assert.ok(new Date(twiceMastered.next_review_at)>new Date(firstMastered.next_review_at));
  const dialogue=dialogues[0];
  await call('PUT','/practice-progress',{dialogue_id:dialogue.id,role:'a',turn_index:2},a.session);
  assert.equal((await call('GET','/practice-progress',{},a.session)).practice[0].turn_index,2);
  assert.equal((await call('GET','/practice-progress',{},changed.session)).practice.length,0);
  await assert.rejects(()=>call('PUT','/practice-progress',{dialogue_id:dialogue.id,role:'a',turn_index:999},a.session),{status:400});
  await assert.rejects(()=>call('PUT','/practice-progress',{dialogue_id:'unknown',role:'a',turn_index:0},a.session),{status:400});
  await call('PUT','/practice-progress',{dialogue_id:dialogue.id,role:'a',turn_index:dialogue.turns.length},a.session);
  await call('PUT','/practice-progress',{dialogue_id:dialogue.id,role:'a',turn_index:dialogue.turns.length},a.session);
  assert.equal((await call('GET','/practice-progress',{},a.session)).practice[0].completed_count,1);

  await db.query("UPDATE users SET trial_until=now()-interval '1 second' WHERE id=$1",[trial.user.id]);
  await assert.rejects(()=>call('PUT','/progress',{material_id:paidId,status:'mastered'},changed.session),{status:403});assert.equal((await call('GET','/progress',{},changed.session)).progress.length,2);assert.ok(!(await call('GET','/review/all',{},changed.session)).items.some((m:any)=>m.id===paidId));
  await call('PATCH','/admin/users',{id:trial.user.id,action:'extend',days:30},admin.session);assert.equal((await call('GET','/me',{},changed.session)).user.hasAccess,true);
  const order=(await call('POST','/orders',{},a.session)).order;assert.equal(order.amount_fen,9900);assert.equal((await call('POST','/orders',{},a.session)).order.id,order.id);
  await assert.rejects(()=>call('POST','/orders/confirm',{id:order.id},changed.session),{status:404});await assert.rejects(()=>call('POST','/orders/confirm',{id:order.id},a.session,false),{status:403});
  await call('POST','/orders/confirm',{id:order.id},a.session);await call('POST','/orders/confirm',{id:order.id},a.session);assert.equal((await call('GET','/me',{},a.session)).user.membership,'lifetime');
  await call('PATCH','/admin/users',{id:trial.user.id,action:'lifetime'},admin.session);assert.equal((await call('GET','/me',{},changed.session)).user.membership,'lifetime');
  await call('PATCH','/admin/users',{id:trial.user.id,action:'disable'},admin.session);await assert.rejects(()=>call('GET','/me',{},changed.session),{status:401});await assert.rejects(()=>call('POST','/auth/login',{email:trial.user.email,password:secret}),{status:401});
  await call('PATCH','/admin/users',{id:trial.user.id,action:'enable'},admin.session);
  const other=await call('POST','/auth/register',{email:'other-'+suffix+'@example.com',password:secret});assert.equal((await call('GET','/progress',{},other.session)).progress.length,0);assert.equal((await call('GET','/learning-state',{},other.session)).state,null);assert.equal((await call('GET','/practice-progress',{},other.session)).practice.length,0);
  await call('POST','/auth/forgot',{email:address});assert.equal(resetUrls.length,1);const reset=new URL(resetUrls[0]).searchParams.get('reset');await call('POST','/auth/reset',{token:reset,password:'new-secure-password-123'});await assert.rejects(()=>call('POST','/auth/reset',{token:reset,password:secret}),{status:400});await assert.rejects(()=>call('GET','/me',{},a.session),{status:401});
  assert.ok((await call('POST','/auth/login',{email:address,password:'new-secure-password-123'})).session);
  await call('POST','/auth/logout',{},other.session);await assert.rejects(()=>call('GET','/me',{},other.session),{status:401});
  assert.ok((await db.query('SELECT * FROM audit_log WHERE actor_id=$1',[adminId])).rows.length>=5);
 }finally{await close();}
});
