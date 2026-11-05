import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import type {DB} from '../src/db.ts';import {migrate,migrations} from '../src/migrations.ts';import {prepareDatabase} from '../src/setup.ts';import {installContent} from '../src/install-content.ts';import {installOgden} from '../src/install-ogden.ts';import {loadOgden} from '../src/ogden-content.ts';import {drillSnapshot} from '../src/ogden-drill.ts';import {ogden} from '../src/ogden.ts';import {isolatedDatabase} from './test-db.ts';
const c=await loadOgden();
async function legacy(db:DB){
 await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of migrations.slice(0,7)){await db.query(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);}
 await installContent(db,JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8')));
 const id=randomUUID(),material=(await db.query('SELECT id FROM materials ORDER BY id LIMIT 1')).rows[0].id;await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic-fixture')",[id,id+'@example.invalid']);await db.query("INSERT INTO progress(user_id,material_id,status,next_review_at) VALUES($1,$2,'mastered','2099-01-01')",[id,material]);return id;
}
test('interrupted 1.0-to-2.0 DDL rolls back entirely, preserves 1.0 data and can safely retry',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await legacy(db);const before=await drillSnapshot(db);let injected=false;
  const failing:DB={query:async(sql,v)=>{const result=await db.query(sql,v);if(!injected&&sql.includes('CREATE TABLE ogden_sources')){injected=true;throw Error('injected migration interruption');}return result;}};
  await assert.rejects(()=>migrate(failing),/injected/);assert.deepEqual(await drillSnapshot(db),before);assert.equal((await db.query("SELECT to_regclass('ogden_sources') AS name")).rows[0].name,null);
  await migrate(db);await migrate(db);assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,9);const after=await drillSnapshot(db);for(const [table,value] of Object.entries(before))if(table!=='schema_migrations')assert.deepEqual(after[table],value,table);
 }finally{await cleanup();}
});
test('failed textbook upgrade restores versions, audits and learning records atomically, then retry succeeds',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);await installOgden(db,c);const id=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[id,id+'@example.invalid']);await ogden({db,userId:id,method:'POST',path:'/api/ogden/results',body:{item_id:'ow-get',mode:'listening',status:'unmastered',request_id:randomUUID()}});
  const before=await drillSnapshot(db),updated=structuredClone(c);updated.version='fixture-failed-upgrade';const item=updated.items.find(x=>x.id==='ow-get')!;item.version++;item.note='fixture-only changed explanation';let injected=false;
  const failing:DB={query:async(sql,v)=>{const result=await db.query(sql,v);if(!injected&&sql.startsWith('INSERT INTO ogden_item_versions')&&v?.[0]==='ow-get'){injected=true;throw Error('injected import interruption');}return result;}};
  await assert.rejects(()=>installOgden(failing,updated),/injected/);assert.deepEqual(await drillSnapshot(db),before);
  await installOgden(db,updated);await installOgden(db,updated);const after=await drillSnapshot(db);for(const table of ['users','progress','orders','ogden_progress','ogden_practice_progress','ogden_practice_events','ogden_content_reviews'])assert.deepEqual(after[table],before[table],table);
  assert.equal((await db.query("SELECT count(*)::int n FROM ogden_item_versions WHERE item_id='ow-get'")).rows[0].n,2);
 }finally{await cleanup();}
});
test('real PostgreSQL backend termination during migration rolls back DDL and releases the migration lock',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {db,cleanup}=await isolatedDatabase();const {default:pg}=await import('pg');const worker=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});worker.on('error',()=>{});let release!:()=>void;try{
  await legacy(db);const before=await drillSnapshot(db),schema=(await db.query('SELECT current_schema() AS name')).rows[0].name;assert.match(schema,/^ee_runtime_[a-f0-9]+$/);await worker.connect();await worker.query('SET search_path TO '+schema);const pid=(await worker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let reached!:()=>void;const ready=new Promise<void>(r=>reached=r),pause=new Promise<void>(r=>release=r);
  const connection:DB={query:async(sql,v)=>{const result=await worker.query(sql,v);if(sql.includes('CREATE TABLE ogden_sources')){reached();await pause;}return result;}};
  const result=migrate(connection).then(()=>null,e=>e);await ready;assert.equal((await db.query('SELECT pg_terminate_backend($1) AS stopped',[pid])).rows[0].stopped,true);release();assert.ok(await result);assert.deepEqual(await drillSnapshot(db),before);await migrate(db);assert.equal((await db.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,9);
 }finally{release?.();await worker.end().catch(()=>{});await cleanup();}
});
