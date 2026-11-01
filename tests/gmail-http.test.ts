import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApplication} from '../src/http.ts';
import {gmailMailer,sealGmailToken,GMAIL_OWNER} from '../src/gmail.ts';
import {orderMailer,resetMailer} from '../src/mail.ts';
import {isolatedDatabase} from './test-db.ts';
import {migrate} from '../src/migrations.ts';
import {digest} from '../src/security.ts';
import type {RuntimeConfig} from '../src/config.ts';

test('HTTP Gmail order notification uses the existing request connection and cannot exhaust a full pool',async()=>{
 const {db,cleanup}=await isolatedDatabase();let connects=0,releases=0,sends=0;
 const pool={query:async()=>{throw new Error('Nested pool query must not occur');},connect:async()=>{connects++;return {query:db.query.bind(db),release:()=>{releases++;}};}};
 const gmail={clientId:'123-test.apps.googleusercontent.com',clientSecret:'fake-secret-for-tests-only'};
 const config:RuntimeConfig={production:false,appUrl:'http://localhost',port:3000,mockCheckout:false,manualPayment:true,mailProvider:'gmail',mailFrom:GMAIL_OWNER,gmail};
 const fetcher:typeof fetch=async(url)=>{
  if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'fake-token'})} as Response;
  if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){sends++;return {ok:true,json:async()=>({id:'gmail-accepted'})} as Response;}
  throw new Error('Unexpected Google endpoint');
 };
 const server=createApplication(pool,config,async()=>{throw new Error('Fallback mailer must not run');},async()=>{throw new Error('Fallback mailer must not run');},client=>{
  const send=gmailMailer(client,gmail,fetcher);return {sendReset:resetMailer(config,fetcher,send),notifyOrder:orderMailer(config,fetcher,send)};
 });
 try{
  await migrate(db);const admin=randomUUID(),buyer=randomUUID(),order=randomUUID();
  await db.query("INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'retained','admin')",[admin,GMAIL_OWNER]);
  await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,'buyer@example.com','retained')",[buyer]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[digest('buyer-session'),buyer]);
  await db.query("INSERT INTO orders(id,user_id,payment_method) VALUES($1,$2,'wechat')",[order,buyer]);
  await db.query("INSERT INTO gmail_credentials(id,admin_id,sender,encrypted_refresh_token,client_id_hash) VALUES('owner',$1,$2,$3,$4)",[admin,GMAIL_OWNER,sealGmailToken('fake-refresh',gmail),digest(gmail.clientId)]);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a!=='string');config.appUrl='http://127.0.0.1:'+a.port;
  const r=await fetch(config.appUrl+'/api/orders/manual/claim',{method:'POST',headers:{Origin:config.appUrl,'Content-Type':'application/json',Cookie:'ee_session=buyer-session'},body:JSON.stringify({id:order})});
  assert.equal(r.status,200);assert.equal((await r.json()).order.status,'payment_claimed');assert.equal(sends,1);assert.equal(connects,1);assert.equal(releases,1);
  assert.equal((await db.query('SELECT status FROM order_notifications WHERE order_id=$1',[order])).rows[0].status,'sent');assert.equal((await db.query('SELECT membership FROM users WHERE id=$1',[buyer])).rows[0].membership,'free');
 }finally{server.closeAllConnections();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));await cleanup();}
});
