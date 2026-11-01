import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailAcceptance} from '../src/mail-acceptance.ts';
import type {RuntimeConfig} from '../src/config.ts';
import {isolatedDatabase} from './test-db.ts';
import {migrate} from '../src/migrations.ts';
import {randomUUID} from 'node:crypto';
const config:RuntimeConfig={production:true,appUrl:'https://example.com',port:3000,mockCheckout:false,manualPayment:false,mailProvider:'disabled',mailFrom:'',resendKey:'fake-test-key'};
const id='cbe3638e-6955-4833-99ce-23ec704d05dd';
test('acceptance requires explicit UUID and key without touching database',async()=>{
 const db={query:async()=>{throw new Error('unexpected database access');}};
 assert.equal((await mailAcceptance(db,config,'invalid')).status,'invalid_test_id');
 assert.equal((await mailAcceptance(db,{...config,resendKey:undefined},id)).status,'missing_resend_key');
});
test('acceptance sends fixed owner test while payments/reset stay disabled, and persists idempotency',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 try{
  await migrate(db);const owner=randomUUID();
  await db.query("INSERT INTO users(id,email,password_hash,role) VALUES($1,'sdqtyc@gmail.com','retained','admin')",[owner]);
  let sends=0;
  const fetcher:typeof fetch=async(url,options)=>{
   sends++;assert.equal(url,'https://api.resend.com/emails');
   const body=JSON.parse(String(options?.body));assert.deepEqual(body.to,['sdqtyc@gmail.com']);
   assert.equal(body.from,'Easy English <onboarding@resend.dev>');assert.ok(body.subject.includes(id));assert.ok(!body.text.includes(config.resendKey));
   assert.equal((options?.headers as Record<string,string>)['Idempotency-Key'],'mail-acceptance/'+id);
   return {ok:true,json:async()=>({id:'test-message-id'})} as Response;
  };
  assert.deepEqual(await mailAcceptance(db,config,id,fetcher),{status:'provider_accepted',messageId:'test-message-id'});
  assert.equal((await mailAcceptance(db,config,id,fetcher)).status,'already_accepted');assert.equal(sends,1);
  assert.equal((await db.query('SELECT membership,password_hash FROM users WHERE id=$1',[owner])).rows[0].membership,'free');
  assert.equal((await db.query('SELECT password_hash FROM users WHERE id=$1',[owner])).rows[0].password_hash,'retained');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM password_resets')).rows[0].n,0);
 }finally{await cleanup();}
});
test('acceptance rejects unavailable owner, provider failures and unsafe response without leaking secrets',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 try{
  await migrate(db);
  assert.equal((await mailAcceptance(db,config,id,async()=>{throw new Error('must not send');})).status,'owner_administrator_unavailable');
  await db.query("INSERT INTO users(id,email,password_hash,role) VALUES($1,'sdqtyc@gmail.com','retained','admin')",[randomUUID()]);
  assert.deepEqual(await mailAcceptance(db,config,id,async()=>({ok:false,status:403}) as Response),{status:'provider_rejected',httpStatus:403});
  const error=await mailAcceptance(db,config,id,async()=>{throw new Error('fake-test-key');});assert.equal(error.status,'test_failed');assert.ok(!JSON.stringify(error).includes('fake-test-key'));
  assert.equal((await mailAcceptance(db,config,id,async()=>({ok:true,json:async()=>({id:'contains secret!?'})}) as Response)).status,'test_failed');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n,0);
 }finally{await cleanup();}
});
