import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeAdmin} from '../src/admin-init.ts';
import {prepareDatabase} from '../src/setup.ts';
import {verifyPassword} from '../src/security.ts';
import {api} from '../src/api.ts';
import {isolatedDatabase} from './test-db.ts';

test('existing-account bootstrap verifies ownership, preserves learning data, revokes old credentials and remains first-only',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 const original='Original9!'+randomUUID(),replacement='Replacement8!'+randomUUID();
 const call=(method:string,path:string,body:any={},session?:string)=>api({db,method,path:'/api'+path,body,session,ip:'bootstrap-test',sendReset:async()=>{},appUrl:'https://example.com',mock:false});
 try{
  await prepareDatabase(db);
  const address='existing-owner@example.com';
  const owner=await call('POST','/auth/register',{email:address,password:original});
  const other=await call('POST','/auth/register',{email:'ordinary@example.com',password:original});
  const id=owner.user.id,material=(await db.query('SELECT id FROM materials WHERE is_free=true LIMIT 1')).rows[0].id;
  await call('PUT','/progress',{material_id:material,status:'review'},owner.session);
  const before=(await db.query('SELECT * FROM progress WHERE user_id=$1',[id])).rows;
  await db.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES('test-reset-marker',$1,now()+interval '1 hour')",[id]);
  const unchanged=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];
  await assert.rejects(()=>initializeAdmin(db,address,replacement),{status:409});
  await assert.rejects(()=>initializeAdmin(db,address,replacement,'incorrect-original'),{status:403});
  await assert.rejects(()=>initializeAdmin(db,'unknown@example.com',replacement,original),{status:403});
  await assert.rejects(()=>initializeAdmin(db,address,original,original),{status:400});
  await assert.rejects(()=>initializeAdmin(db,address,'weak',original),{status:400});
  assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0],unchanged);
  await db.query('UPDATE users SET disabled=true WHERE id=$1',[id]);
  await assert.rejects(()=>initializeAdmin(db,address,replacement,original),{status:403});
  await db.query('UPDATE users SET disabled=false WHERE id=$1',[id]);
  // A failure after updating the user must roll back the role, hash and revocations.
  const failing={query:async(sql:string,values?:any[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw new Error('Synthetic audit failure');return db.query(sql,values);}};
  await assert.rejects(()=>initializeAdmin(failing,address,replacement,original),/Synthetic audit failure/);
  assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0],unchanged);
  assert.equal((await call('GET','/me',{},owner.session)).user.role,'user');
  const result=await initializeAdmin(db,address,replacement,original);assert.equal(result.id,id);
  const row=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];
  assert.equal(row.role,'admin');assert.equal(row.membership,'lifetime');assert.equal(row.must_change_password,false);
  assert.notEqual(row.password_hash,replacement);assert.ok(await verifyPassword(replacement,row.password_hash));assert.equal(await verifyPassword(original,row.password_hash),false);
  assert.deepEqual((await db.query('SELECT * FROM progress WHERE user_id=$1',[id])).rows,before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM materials')).rows[0].n,700);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM password_resets WHERE user_id=$1 AND expires_at>now()',[id])).rows[0].n,0);
  await assert.rejects(()=>call('GET','/me',{},owner.session),{status:401});
  await assert.rejects(()=>call('POST','/auth/login',{email:address,password:original}),{status:401});
  const login=await call('POST','/auth/login',{email:address,password:replacement});assert.equal(login.user.role,'admin');
  await call('GET','/admin/users',{},login.session);
  const trial=await call('POST','/admin/trials',{email:'trial@example.com',days:7},login.session);assert.equal(trial.user.membership,'trial');assert.ok(new Date(trial.user.trial_until).getTime()>Date.now()+6*86400000);
  await assert.rejects(()=>call('GET','/admin/users',{},other.session),{status:403});
  await assert.rejects(()=>call('POST','/admin/trials',{email:'denied@example.com',days:7},other.session),{status:403});
  await assert.rejects(()=>call('POST','/admin/initialize',{email:address,password:replacement},other.session),{status:403});
  await assert.rejects(()=>initializeAdmin(db,address,replacement,original),{status:409});
  await assert.rejects(()=>initializeAdmin(db,'second@example.com',replacement),{status:409});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE role='admin'")).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action='initialize_first_admin_existing_account' AND actor_id=$1 AND target_id=$1",[id])).rows[0].n,1);
 }finally{await cleanup();}
});
