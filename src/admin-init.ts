import {randomUUID} from 'node:crypto';
import type {DB} from './db.ts';
import {email,hashPassword,HttpError,requireValue} from './security.ts';
export function adminPassword(value:unknown){
 requireValue(typeof value==='string'&&value.length>=16&&value.length<=128,'Administrator password must contain 16–128 characters');
 requireValue(!/admin|password|changeme|letmein|qwerty|easyenglish/i.test(value),'Use a unique administrator password, not a default or example');
 requireValue([/[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/].filter(re=>re.test(value)).length>=3,'Use at least three character types in the administrator password');
 requireValue(!/(.)\1{5}/.test(value),'Do not use repeated-character passwords');
 return value;
}
export async function initializeAdmin(db:DB,address:unknown,secret:unknown){
 const normalized=email(address),hash=await hashPassword(adminPassword(secret));
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(684013213)');
  if((await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows.length)throw new HttpError(409,'An administrator already exists; initialization is closed');
  if((await db.query('SELECT id FROM users WHERE email=$1',[normalized])).rows.length)throw new HttpError(409,'Email already belongs to an account; it will not be overwritten or promoted');
  const id=randomUUID();
  await db.query("INSERT INTO users(id,email,password_hash,role,membership) VALUES($1,$2,$3,'admin','lifetime')",[id,normalized,hash]);
  await db.query("INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$2,'initialize_first_admin')",[randomUUID(),id]);
  await db.query('COMMIT');return {id};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
