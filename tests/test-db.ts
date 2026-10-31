import {randomUUID} from 'node:crypto';
import type {DB} from '../src/db.ts';
export async function isolatedDatabase(){
 let db:DB,close:()=>Promise<void>;
 if(process.env.TEST_DATABASE_URL){const {default:pg}=await import('pg');const client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();db=client;close=()=>client.end();}
 else{const {PGlite}=await import('@electric-sql/pglite');const engine=new PGlite();db={query:async(sql,v)=>{if(!v&&sql.includes(';')){await engine.exec(sql);return {rows:[]};}const r=await engine.query(sql,v);return {rows:r.rows as any[],rowCount:r.affectedRows};}};close=()=>engine.close();}
 const schema='ee_runtime_'+randomUUID().replaceAll('-','');await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);
 return {db,cleanup:async()=>{try{await db.query('SET search_path TO public');await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await close();}}};
}
