import {readFile} from 'node:fs/promises';
import type {DB} from './db.ts';
export const migrations=['001_init.sql','002_learning_method.sql','003_curriculum.sql','004_manual_payment.sql','005_manual_payment_safety.sql'];
export async function migrate(db:DB){
 await db.query('BEGIN');
 try{
  // Serialize migrations so concurrent deploys cannot interleave DDL.
  await db.query('SELECT pg_advisory_xact_lock(684013211)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of migrations){
   if((await db.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rows.length)continue;
   await db.query(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));
   await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
}
