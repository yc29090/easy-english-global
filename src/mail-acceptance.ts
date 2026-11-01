import {randomUUID} from 'node:crypto';
import type {DB} from './db.ts';
import type {RuntimeConfig} from './config.ts';

// Explicitly requested deployment check, independent from public mail/payment switches.
// No user-supplied destination, credential output, orders or membership mutations.
export async function mailAcceptance(db:DB,config:RuntimeConfig,testId:string,fetcher:typeof fetch=fetch){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testId))return {status:'invalid_test_id'};
 if(!config.resendKey)return {status:'missing_resend_key'};
 const action='mail_acceptance:'+testId;
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(684013212)');
  if((await db.query('SELECT id FROM audit_log WHERE action=$1',[action])).rows.length){await db.query('COMMIT');return {status:'already_accepted'};}
  const owner=(await db.query("SELECT id FROM users WHERE email='sdqtyc@gmail.com' AND role='admin' AND disabled=false")).rows[0];
  if(!owner){await db.query('ROLLBACK');return {status:'owner_administrator_unavailable'};}
  const response=await fetcher('https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:'Bearer '+config.resendKey,'Content-Type':'application/json','Idempotency-Key':'mail-acceptance/'+testId},
   body:JSON.stringify({from:'Easy English <onboarding@resend.dev>',to:['sdqtyc@gmail.com'],subject:'Easy English · 网站发信验收 · '+testId,
    text:'这是 easy-english-global 网站从 Render 通过 Resend 发出的真实测试邮件。\n验收编号：'+testId+'\n仅用于核验 Gmail 收件，无需付款，不会开通会员。人工支付开关仍关闭。\n请核对本邮件主题和验收编号后确认收到。'}),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok){await db.query('ROLLBACK');return {status:'provider_rejected',httpStatus:response.status};}
  const data=await response.json();
  if(typeof data.id!=='string'||!/^[a-z0-9-]{1,100}$/i.test(data.id))throw new Error('Invalid provider response');
  await db.query('INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$2,$3)',[randomUUID(),owner.id,action]);
  await db.query('COMMIT');
  return {status:'provider_accepted',messageId:data.id};
 }catch{
  await db.query('ROLLBACK');return {status:'test_failed'};
 }
}
