import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {gmailAdmin,gmailMailer,sealGmailToken,openGmailToken,GMAIL_SCOPE,GMAIL_OWNER} from '../src/gmail.ts';
import {digest} from '../src/security.ts';
import {loadConfig} from '../src/config.ts';
import {isolatedDatabase} from './test-db.ts';
import {migrate} from '../src/migrations.ts';
import {api} from '../src/api.ts';
const config={clientId:'12345-test.apps.googleusercontent.com',clientSecret:'fake-client-secret-for-tests-only'};
test('Gmail credentials use authenticated encryption bound to client and purpose',()=>{
 const sealed=sealGmailToken('refresh-token-secret',config);assert.ok(!sealed.includes('refresh-token-secret'));assert.notEqual(sealed,sealGmailToken('refresh-token-secret',config));
 assert.equal(openGmailToken(sealed,config),'refresh-token-secret');
 assert.throws(()=>openGmailToken(sealed,{...config,clientSecret:'wrong-secret'}));assert.throws(()=>openGmailToken(sealed,config,'state'));
 const parts=sealed.split('.');parts[3]=Buffer.from('corrupt-token').toString('base64url');assert.throws(()=>openGmailToken(parts.join('.'),config));
});
test('Gmail configuration is optional while disabled and required when enabled',()=>{
 assert.equal(loadConfig({MAIL_PROVIDER:'disabled'}).gmail,undefined);
 assert.equal(loadConfig({MAIL_PROVIDER:'disabled',GMAIL_CLIENT_ID:config.clientId}).gmail,undefined);
 assert.deepEqual(loadConfig({MAIL_PROVIDER:'disabled',GMAIL_CLIENT_ID:config.clientId,GMAIL_CLIENT_SECRET:config.clientSecret}).gmail,config);
 assert.throws(()=>loadConfig({MAIL_PROVIDER:'gmail'}));
 assert.throws(()=>loadConfig({MAIL_PROVIDER:'gmail',GMAIL_CLIENT_ID:config.clientId,GMAIL_CLIENT_SECRET:config.clientSecret,MAIL_FROM:'wrong@example.com'}));
 assert.equal(loadConfig({MAIL_PROVIDER:'gmail',GMAIL_CLIENT_ID:config.clientId,GMAIL_CLIENT_SECRET:config.clientSecret}).mailFrom,GMAIL_OWNER);
});
test('Gmail OAuth enforces owner/session/PKCE, encrypts refresh token, sends and revokes without changing users or orders',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 try{
  await migrate(db);await migrate(db);const owner=randomUUID(),other=randomUUID();
  await db.query("INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'retained','admin')",[owner,GMAIL_OWNER]);
  await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,'ordinary@example.com','retained')",[other]);
  const user={id:owner,email:GMAIL_OWNER,role:'admin'},base={db,config,user,session:'owner-browser-session',appUrl:'https://example.com'};
  const ctx=(path:string,method='POST',query?:URLSearchParams)=>({...base,path:'/api/admin/mail/gmail/'+path,method,query});
  const status=await gmailAdmin(ctx('status','GET'));assert.equal(status.connected,false);assert.equal(status.configured,true);
  await assert.rejects(()=>gmailAdmin({...ctx('start'),user:{...user,email:'other@example.com'}}),{status:403});
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[digest('other-session'),other]);
  await assert.rejects(()=>api({db,method:'POST',path:'/api/admin/mail/gmail/start',session:'other-session',body:{},ip:'gmail-test',appUrl:base.appUrl,mock:false,sendReset:async()=>{},gmailConfig:config}),{status:403});
  const authorize=new URL((await gmailAdmin(ctx('start'))).authorizationUrl),state=authorize.searchParams.get('state')!;
  assert.equal(authorize.origin,'https://accounts.google.com');assert.ok(authorize.searchParams.get('scope')!.includes(GMAIL_SCOPE));assert.ok(!authorize.searchParams.get('scope')!.includes('gmail.readonly'));
  assert.equal(authorize.searchParams.get('access_type'),'offline');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert.equal(authorize.searchParams.get('redirect_uri'),'https://example.com/api/admin/mail/gmail/callback');
  assert.ok(!authorize.toString().includes(config.clientSecret));
  const pending=(await db.query('SELECT * FROM gmail_oauth_states')).rows[0];assert.equal(pending.state_hash,digest(state));assert.ok(!pending.encrypted_verifier.includes(state));
  const query=new URLSearchParams({state,code:'valid-code'});
  await assert.rejects(()=>gmailAdmin({...ctx('callback','GET',query),session:'wrong-browser'},async()=>{throw new Error('must not call Google');}),{status:400});
  let sends=0,refreshes=0,revocations=0;
  const fetcher:typeof fetch=async(url,options)=>{
   if(url==='https://oauth2.googleapis.com/token'){
    const body=new URLSearchParams(String(options?.body));assert.equal(body.get('client_secret'),config.clientSecret);
    if(body.get('grant_type')==='authorization_code'){
     assert.equal(body.get('code'),'valid-code');const verifier=body.get('code_verifier')!;const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(verifier).digest('base64url'),authorize.searchParams.get('code_challenge'));
    }else{refreshes++;assert.equal(body.get('refresh_token'),'refresh-test-token');}
    return {ok:true,json:async()=>({access_token:'fake-access-token',refresh_token:'refresh-test-token',scope:'openid email '+GMAIL_SCOPE})} as Response;
   }
   if(url==='https://openidconnect.googleapis.com/v1/userinfo')return {ok:true,json:async()=>({email:GMAIL_OWNER,email_verified:true})} as Response;
   if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){
    sends++;assert.equal((options?.headers as any).Authorization,'Bearer fake-access-token');
    const mime=Buffer.from(JSON.parse(String(options?.body)).raw,'base64url').toString('utf8');assert.match(mime,/From: Easy English <sdqtyc@gmail.com>/);assert.match(mime,/To: sdqtyc@gmail.com/);assert.ok(!mime.includes('refresh-test-token'));return {ok:true,json:async()=>({id:'abc123'})} as Response;
   }
   if(url==='https://oauth2.googleapis.com/revoke'){revocations++;return {ok:true} as Response;}
   throw new Error('Unexpected request');
  };
  assert.equal((await gmailAdmin(ctx('callback','GET',query),fetcher)).gmailRedirect,true);
  await assert.rejects(()=>gmailAdmin(ctx('callback','GET',query),fetcher),{status:400});
  const credential=(await db.query('SELECT * FROM gmail_credentials')).rows[0];assert.notEqual(credential.encrypted_refresh_token,'refresh-test-token');assert.equal(openGmailToken(credential.encrypted_refresh_token,config),'refresh-test-token');
  const connected=await gmailAdmin(ctx('status','GET'));assert.equal(connected.connected,true);assert.ok(!JSON.stringify(connected).includes('refresh-test-token'));assert.ok(!JSON.stringify(connected).includes(config.clientSecret));
  const accepted=await gmailAdmin(ctx('test'),fetcher);assert.equal(accepted.status,'provider_accepted');assert.equal(sends,1);assert.equal(refreshes,1);
  assert.ok((await gmailAdmin(ctx('status','GET'))).testedAt);
  await assert.rejects(()=>gmailMailer(db,config,fetcher)('bad@example.com\r\nBcc: x@y.com','subject','text'));
  await assert.rejects(()=>gmailMailer(db,config,fetcher)(GMAIL_OWNER,'subject\r\nBcc: x@y.com','text'));
  assert.equal((await gmailAdmin({...ctx('status','GET'),config:{...config,clientSecret:'rotated'}},fetcher)).connected,false);
  assert.equal((await gmailAdmin(ctx('disconnect'),fetcher)).connected,false);assert.equal(revocations,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gmail_credentials')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,0);
  assert.equal((await db.query('SELECT password_hash FROM users WHERE id=$1',[owner])).rows[0].password_hash,'retained');
 }finally{await cleanup();}
});
test('Gmail OAuth rejects wrong identity, declined scope, expired state and provider errors safely',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 try{
  await migrate(db);const id=randomUUID();await db.query("INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,'retained','admin')",[id,GMAIL_OWNER]);
  const base={db,config,user:{id,email:GMAIL_OWNER,role:'admin'},session:'session',appUrl:'https://example.com'};
  const start=()=>gmailAdmin({...base,path:'/api/admin/mail/gmail/start',method:'POST'});
  for(const kind of ['wrong-owner','declined-scope','provider-error']){
   const state=new URL((await start()).authorizationUrl).searchParams.get('state')!;
   const fetcher:typeof fetch=async(url)=>{
    if(kind==='provider-error')throw new Error('SECRET MUST NOT LEAK');
    if(url==='https://oauth2.googleapis.com/revoke')return {ok:true} as Response;
    if(url==='https://openidconnect.googleapis.com/v1/userinfo')return {ok:true,json:async()=>({email:'wrong@example.com',email_verified:true})} as Response;
    return {ok:true,json:async()=>({access_token:'access',refresh_token:'refresh',scope:kind==='declined-scope'?'openid email':GMAIL_SCOPE})} as Response;
   };
   await assert.rejects(()=>gmailAdmin({...base,path:'/api/admin/mail/gmail/callback',method:'GET',query:new URLSearchParams({state,code:'x'})},fetcher),(e:any)=>e.status===502&&!e.message.includes('SECRET'));
   assert.equal((await db.query('SELECT count(*)::int AS n FROM gmail_credentials')).rows[0].n,0);
  }
  const state=new URL((await start()).authorizationUrl).searchParams.get('state')!;
  await db.query("UPDATE gmail_oauth_states SET expires_at=now()-interval '1 second'");
  await assert.rejects(()=>gmailAdmin({...base,path:'/api/admin/mail/gmail/callback',method:'GET',query:new URLSearchParams({state,code:'x'})}),{status:400});
 }finally{await cleanup();}
});
