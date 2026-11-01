import {createHash,randomBytes,randomUUID,createCipheriv,createDecipheriv,hkdfSync} from 'node:crypto';
import type {DB} from './db.ts';
import {digest,HttpError} from './security.ts';
export const GMAIL_OWNER='sdqtyc@gmail.com';
export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.send';
export type GmailConfig={clientId:string;clientSecret:string};
export type GmailSend=(to:string,subject:string,text:string)=>Promise<{id:string}>;
const key=(c:GmailConfig)=>Buffer.from(hkdfSync('sha256',c.clientSecret,c.clientId,'easy-english-gmail-v1',32));
export function sealGmailToken(value:string,c:GmailConfig,purpose='refresh'){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(c),iv);cipher.setAAD(Buffer.from(purpose));
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function openGmailToken(value:string,c:GmailConfig,purpose='refresh'){
 const [version,iv,tag,data,...rest]=value.split('.');if(version!=='v1'||!iv||!tag||!data||rest.length)throw new Error('Invalid encrypted credential');
 const decipher=createDecipheriv('aes-256-gcm',key(c),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
async function postForm(url:string,values:Record<string,string>,fetcher:typeof fetch){
 const r=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values).toString(),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok)throw new Error('Google authorization request failed');if(url.endsWith('/revoke'))return {};return r.json();
}
export function gmailMailer(db:DB,c:GmailConfig|undefined,fetcher:typeof fetch=fetch):GmailSend{
 return async(to,subject,text)=>{
  if(!c)throw new Error('Gmail is not configured');
  if(to.length>254||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(to)||/[\r\n]/.test(subject)||subject.length>200||text.length>20000)throw new Error('Invalid mail message');
  const credential=(await db.query("SELECT encrypted_refresh_token,client_id_hash FROM gmail_credentials WHERE id='owner'")).rows[0];
  if(!credential||credential.client_id_hash!==digest(c.clientId))throw new Error('Gmail authorization required');
  const refreshToken=openGmailToken(credential.encrypted_refresh_token,c);
  const token=await postForm('https://oauth2.googleapis.com/token',{client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'},fetcher);
  if(typeof token.access_token!=='string'||!token.access_token||/[\r\n]/.test(token.access_token))throw new Error('Gmail token refresh failed');
  const encodedBody=Buffer.from(text,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
  const mime=['From: Easy English <'+GMAIL_OWNER+'>','To: '+to,'Subject: =?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+encodedBody].join('\r\n');
  const r=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')}),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!r.ok)throw new Error('Gmail delivery request failed');const result=await r.json();
  if(typeof result.id!=='string'||!/^[a-z0-9_-]{1,128}$/i.test(result.id))throw new Error('Invalid Gmail response');return {id:result.id};
 };
}
export type GmailAdminContext={db:DB;config?:GmailConfig;user:{id:string;email:string;role:string};session:string;method:string;path:string;query?:URLSearchParams;appUrl:string};
export async function gmailAdmin(c:GmailAdminContext,fetcher:typeof fetch=fetch):Promise<any>{
 if(c.user.role!=='admin'||c.user.email!==GMAIL_OWNER)throw new HttpError(403,'Owner administrator access required');
 const redirectUri=c.appUrl+'/api/admin/mail/gmail/callback';
 const row=(await c.db.query("SELECT sender,encrypted_refresh_token,client_id_hash,tested_at FROM gmail_credentials WHERE id='owner'")).rows[0];
 if(c.path==='/api/admin/mail/gmail/status'&&c.method==='GET'){
  let connected=false;try{connected=!!c.config&&!!row&&row.client_id_hash===digest(c.config.clientId)&&!!openGmailToken(row.encrypted_refresh_token,c.config);}catch{/* Rotated or corrupted credentials require reconnect. */}
  return {configured:!!c.config,connected,sender:connected?row.sender:null,testedAt:connected?row.tested_at:null,redirectUri};
 }
 if(!c.config)throw new HttpError(503,'Configure GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Render first');
 const config=c.config;
 if(c.path==='/api/admin/mail/gmail/start'&&c.method==='POST'){
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url'),hash=digest(state);
  await c.db.query('DELETE FROM gmail_oauth_states WHERE expires_at<now()');
  await c.db.query('DELETE FROM gmail_oauth_states WHERE admin_id=$1',[c.user.id]);
  await c.db.query("INSERT INTO gmail_oauth_states(state_hash,admin_id,session_hash,encrypted_verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",[hash,c.user.id,digest(c.session),sealGmailToken(verifier,config,'state:'+hash)]);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email '+GMAIL_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',login_hint:GMAIL_OWNER}).toString();
  return {authorizationUrl:url.toString()};
 }
 if(c.path==='/api/admin/mail/gmail/callback'&&c.method==='GET'){
  const state=c.query?.get('state')||'',code=c.query?.get('code')||'';
  if(!/^[a-z0-9_-]{43}$/i.test(state))throw new HttpError(400,'Invalid Gmail authorization state');
  const hash=digest(state),pending=(await c.db.query('DELETE FROM gmail_oauth_states WHERE state_hash=$1 AND admin_id=$2 AND session_hash=$3 AND expires_at>now() RETURNING encrypted_verifier',[hash,c.user.id,digest(c.session)])).rows[0];
  if(!pending)throw new HttpError(400,'Gmail authorization expired or belongs to another session');
  if(c.query?.has('error')||!code||code.length>4096)throw new HttpError(400,'Google authorization was not completed');
  let tokens:any;
  try{
   const verifier=openGmailToken(pending.encrypted_verifier,config,'state:'+hash);
   tokens=await postForm('https://oauth2.googleapis.com/token',{client_id:config.clientId,client_secret:config.clientSecret,code,code_verifier:verifier,redirect_uri:redirectUri,grant_type:'authorization_code'},fetcher);
   if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||!tokens.refresh_token||typeof tokens.scope!=='string'||!tokens.scope.split(' ').includes(GMAIL_SCOPE))throw new Error('Missing Gmail permission');
   const identity=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!identity.ok)throw new Error('Identity verification failed');const owner=await identity.json();
   if(owner.email!==GMAIL_OWNER||owner.email_verified!==true)throw new Error('Wrong Gmail account');
   await c.db.query("INSERT INTO gmail_credentials(id,admin_id,sender,encrypted_refresh_token,client_id_hash) VALUES('owner',$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET admin_id=EXCLUDED.admin_id,sender=EXCLUDED.sender,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,client_id_hash=EXCLUDED.client_id_hash,connected_at=now(),tested_at=NULL",[c.user.id,GMAIL_OWNER,sealGmailToken(tokens.refresh_token,config),digest(config.clientId)]);
   await c.db.query('INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$2,$3)',[randomUUID(),c.user.id,'gmail_connected']);
   return {gmailRedirect:true};
  }catch{
   if(typeof tokens?.access_token==='string')try{await postForm('https://oauth2.googleapis.com/revoke',{token:tokens.access_token},fetcher);}catch{/* Never expose provider response or tokens. */}
   throw new HttpError(502,'Gmail connection failed; grant send permission using the owner account');
  }
 }
 if(c.path==='/api/admin/mail/gmail/test'&&c.method==='POST'){
  const id=randomUUID();
  try{
   const result=await gmailMailer(c.db,config,fetcher)(GMAIL_OWNER,'Easy English · Gmail 官方发信验收 · '+id,'本邮件由网站通过 Google OAuth 和 Gmail API 发出。\n验收编号：'+id+'\n无需付款，不开通会员。请核对 Gmail 实际收件。');
   await c.db.query("UPDATE gmail_credentials SET tested_at=now() WHERE id='owner'");
   await c.db.query('INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$2,$3)',[randomUUID(),c.user.id,'gmail_test_accepted:'+id]);
   return {status:'provider_accepted',testId:id,messageId:result.id};
  }catch{throw new HttpError(502,'Gmail test failed; check authorization and Google API configuration');}
 }
 if(c.path==='/api/admin/mail/gmail/disconnect'&&c.method==='POST'){
  if(row)try{await postForm('https://oauth2.googleapis.com/revoke',{token:openGmailToken(row.encrypted_refresh_token,config)},fetcher);}catch{throw new HttpError(502,'Google revocation failed; revoke in Google account permissions before retrying');}
  await c.db.query("DELETE FROM gmail_credentials WHERE id='owner'");await c.db.query('DELETE FROM gmail_oauth_states WHERE admin_id=$1',[c.user.id]);
  return {connected:false};
 }
 throw new HttpError(404,'Not found');
}
