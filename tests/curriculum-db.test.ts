import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {DB} from '../src/db.ts';
import {migrate} from '../src/migrations.ts';
import {installContent} from '../src/install-content.ts';
import {api} from '../src/api.ts';
import {digest} from '../src/security.ts';

test('full curriculum import is idempotent, preserves user records, and enforces textbook/dialogue permissions',async()=>{
 let db:DB,close:()=>Promise<void>;
 if(process.env.TEST_DATABASE_URL){const {default:pg}=await import('pg');const client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();db=client;close=()=>client.end();}
 else{const {PGlite}=await import('@electric-sql/pglite');const engine=new PGlite();db={query:async(sql,v)=>{if(!v&&sql.includes(';')){await engine.exec(sql);return {rows:[]};}const r=await engine.query(sql,v);return {rows:r.rows as any[],rowCount:r.affectedRows};}};close=()=>engine.close();}
 const schema='ee_content_'+randomUUID().replaceAll('-','');
 try{
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);
  const data=JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8'));
  const freeId=randomUUID(),trialId=randomUUID(),lifetimeId=randomUUID();
  for(const [id,membership] of [[freeId,'free'],[trialId,'trial'],[lifetimeId,'lifetime']]){
   await db.query("INSERT INTO users(id,email,password_hash,membership,trial_until) VALUES($1,$2,'existing-password-hash',$3,now()+interval '7 days')",[id,id+'@example.com',membership]);
   await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[digest(id),id]);
  }
  const call=(path:string,session?:string,body?:any)=>api({db,method:body?'PUT':'GET',path:'/api'+path,body:body||{},session,ip:'content-test',sendReset:async()=>{},appUrl:'https://example.com',mock:false});
  const install=await installContent(db,data);assert.deepEqual(install.inserted,{scenes:20,words:500,phrases:200,dialogues:100});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM materials')).rows[0].n,700);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM curriculum_dialogues')).rows[0].n,100);
  const freeWord=data.materials.find((m:any)=>m.is_free).id,paidWord=data.materials.find((m:any)=>!m.is_free).id,paidDialogue=data.dialogues.find((d:any)=>!d.is_free);
  await call('/progress',freeId,{material_id:freeWord,status:'unmastered'});
  await call('/learning-state',freeId,{material_id:freeWord});
  const freeDialogue=data.dialogues.find((d:any)=>d.is_free);
  await call('/practice-progress',freeId,{dialogue_id:freeDialogue.id,role:'a',turn_index:2});
  const before={users:(await db.query('SELECT * FROM users ORDER BY id')).rows,progress:(await db.query('SELECT * FROM progress')).rows,state:(await db.query('SELECT * FROM learning_state')).rows,practice:(await db.query('SELECT * FROM practice_progress')).rows};
  const again=await installContent(db,data);assert.deepEqual(again.inserted,{scenes:0,words:0,phrases:0,dialogues:0});
  for(const [table,expected] of [['users',before.users],['progress',before.progress],['learning_state',before.state],['practice_progress',before.practice]] as const){assert.deepEqual((await db.query('SELECT * FROM '+table+(table==='users'?' ORDER BY id':''))).rows,expected);}
  const guest=await call('/catalog'),free=await call('/catalog',freeId),trial=await call('/catalog',trialId),lifetime=await call('/catalog',lifetimeId);
  assert.equal(guest.materials.length,70);assert.equal(free.materials.length,70);assert.equal(trial.materials.length,700);assert.equal(lifetime.materials.length,700);
  assert.equal(guest.dialogues.filter((d:any)=>d.scene_id).length,10);assert.equal(trial.dialogues.filter((d:any)=>d.scene_id).length,100);assert.equal(lifetime.dialogues.filter((d:any)=>d.scene_id).length,100);
  assert.equal(lifetime.scenes.length,20);for(const s of lifetime.scenes)assert.equal(lifetime.dialogues.filter((d:any)=>d.scene_id===s.id).length,5);
  assert.equal(lifetime.dialogues.length,103); // The three legacy free presets keep their IDs and progress.
  assert.ok(!JSON.stringify(guest.dialogues).includes(paidDialogue.id));
  await assert.rejects(()=>call('/progress',freeId,{material_id:paidWord,status:'learned'}),{status:403});
  await assert.rejects(()=>call('/practice-progress',freeId,{dialogue_id:paidDialogue.id,role:'b',turn_index:1}),{status:403});
  await assert.rejects(()=>call('/practice-progress',undefined,{dialogue_id:paidDialogue.id,role:'b',turn_index:1}),{status:401});
  await call('/progress',trialId,{material_id:paidWord,status:'review'});
  await call('/practice-progress',trialId,{dialogue_id:paidDialogue.id,role:'b',turn_index:1});
  assert.equal((await call('/practice-progress',lifetimeId)).practice.length,0);
  assert.equal((await call('/progress',lifetimeId)).progress.length,0);
  await db.query("UPDATE users SET trial_until=now()-interval '1 minute' WHERE id=$1",[trialId]);
  assert.equal((await call('/catalog',trialId)).materials.length,70);
  assert.equal((await call('/progress',trialId)).progress.length,1);assert.equal((await call('/practice-progress',trialId)).practice.length,1);
  assert.ok(!(await call('/review/all',trialId)).items.some((m:any)=>m.id===paidWord));
  await assert.rejects(()=>call('/practice-progress',trialId,{dialogue_id:paidDialogue.id,role:'b',turn_index:2}),{status:403});
  await db.query('UPDATE users SET disabled=true WHERE id=$1',[lifetimeId]);await assert.rejects(()=>call('/progress',lifetimeId,{material_id:paidWord,status:'learned'}),{status:401});
  // An old unrelated record must survive installing/validating a complete curriculum.
  await db.query("INSERT INTO scenes(id,title_en,title_zh,category) VALUES('legacy-scene','Previous','旧教材','life')");
  await db.query("INSERT INTO materials(id,kind,english,chinese,scene_id,is_free) VALUES('legacy-material','word','legacyheadword','旧词条','legacy-scene',true)");
  await call('/progress',freeId,{material_id:'legacy-material',status:'mastered'});
  const old=(await db.query("SELECT * FROM progress WHERE material_id='legacy-material'")).rows;
  await installContent(db,data);assert.deepEqual((await db.query("SELECT * FROM progress WHERE material_id='legacy-material'")).rows,old);
  // Force a late conflict after an extra scene has been inserted; all changes must roll back.
  const conflict=structuredClone(data);conflict.version='conflict-test';const originalScene=conflict.scenes[0].id;conflict.scenes[0].id='new-conflicting-scene';
  for(const m of conflict.materials)if(m.scene_id===originalScene)m.scene_id='new-conflicting-scene';
  for(const d of conflict.dialogues)if(d.scene_id===originalScene)d.scene_id='new-conflicting-scene';
  await assert.rejects(()=>installContent(db,conflict),/Material conflict/);
  assert.equal((await db.query("SELECT * FROM scenes WHERE id='new-conflicting-scene'")).rows.length,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM materials')).rows[0].n,701);
  assert.deepEqual((await db.query("SELECT * FROM progress WHERE material_id='legacy-material'")).rows,old);
  const mutated=structuredClone(data);mutated.materials[0].chinese='修改后的翻译';await assert.rejects(()=>installContent(db,mutated),/Installed version differs/);
 }finally{try{await db.query('SET search_path TO public');await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await close();}}
});
