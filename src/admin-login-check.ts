import type {DB} from './db.ts';
import {email,verifyPassword} from './security.ts';
export const adminSite='https://easy-english-global.onrender.com';
export type AdminLoginCheck='LOCAL_ACCOUNT_NOT_READY'|'LOCAL_PASSWORD_MISMATCH'|'LOCAL_CHECK_FAILED'|'WEBSITE_LOGIN_OK'|'WEBSITE_PASSWORD_REJECTED'|'WEBSITE_RATE_LIMITED'|'WEBSITE_UNAVAILABLE'|'WEBSITE_RESPONSE_INVALID'|'WEBSITE_ACCOUNT_MISMATCH'|'WEBSITE_LOGOUT_UNCONFIRMED';
/** Returns only fixed codes. Never returns credentials, hashes, cookies or raw errors. */
export async function checkAdminLogin(db:DB,address:string,password:string,fetcher:typeof fetch=fetch):Promise<AdminLoginCheck>{
 let owner:any;
 try{
  owner=(await db.query('SELECT id,email,role,disabled,password_hash FROM users WHERE email=$1',[email(address)])).rows[0];
  if(!owner||owner.role!=='admin'||owner.disabled)return 'LOCAL_ACCOUNT_NOT_READY';
  if(!await verifyPassword(password,owner.password_hash))return 'LOCAL_PASSWORD_MISMATCH';
 }catch{return 'LOCAL_CHECK_FAILED';}
 let cookie:string|undefined,result:AdminLoginCheck='WEBSITE_UNAVAILABLE';
 const write=(path:string,body:unknown,session?:string)=>fetcher(adminSite+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Origin:adminSite,'Content-Type':'application/json',...(session?{Cookie:session}:{})},body:JSON.stringify(body)});
 try{
  const response=await write('/api/auth/login',{email:owner.email,password});
  cookie=response.headers.get('set-cookie')?.split(';')[0];
  if(response.status===401)result='WEBSITE_PASSWORD_REJECTED';
  else if(response.status===429)result='WEBSITE_RATE_LIMITED';
  else if(!response.ok)result='WEBSITE_UNAVAILABLE';
  else{
   result='WEBSITE_RESPONSE_INVALID';
   const data=await response.json();
   if(cookie){result=data?.user?.id===owner.id&&data?.user?.email===owner.email&&data?.user?.role==='admin'?'WEBSITE_LOGIN_OK':'WEBSITE_ACCOUNT_MISMATCH';}
  }
 }catch{result='WEBSITE_UNAVAILABLE';}
 finally{
  // Do not leave the diagnostic logged in, including if response parsing fails.
  if(cookie){try{const response=await write('/api/auth/logout',{},cookie);if(!response.ok&&result==='WEBSITE_LOGIN_OK')result='WEBSITE_LOGOUT_UNCONFIRMED';}catch{if(result==='WEBSITE_LOGIN_OK')result='WEBSITE_LOGOUT_UNCONFIRMED';}}
  cookie=undefined;owner=undefined;
 }
 return result;
}
export function adminLoginCheckMessage(code:AdminLoginCheck){
 const messages:Record<AdminLoginCheck,string>={
  LOCAL_ACCOUNT_NOT_READY:'本地检查：该数据库中没有可用的管理员账号。',
  LOCAL_PASSWORD_MISMATCH:'本地检查：输入的密码与初始化时保存的密码不一致。未尝试网站登录，也没有修改密码。',
  LOCAL_CHECK_FAILED:'本地检查未完成。没有修改账号；请检查数据库连接。',
  WEBSITE_LOGIN_OK:'本地密码验证通过；网站管理员登录成功，测试会话已退出。请在同一手机上核对浏览器的输入或自动填充。',
  WEBSITE_PASSWORD_REJECTED:'本地密码验证通过，但网站拒绝了同一密码。请报告此结果，由维护人员排查网站与数据库配置。',
  WEBSITE_RATE_LIMITED:'本地密码验证通过；网站请求次数受限，请稍后再试。',
  WEBSITE_UNAVAILABLE:'本地密码验证通过；网站检查未完成，可能是网络、服务或响应问题。',
  WEBSITE_RESPONSE_INVALID:'本地密码验证通过；网站登录响应格式异常。',
  WEBSITE_ACCOUNT_MISMATCH:'本地密码验证通过；网站返回的账号与数据库不一致，请报告此结果。',
  WEBSITE_LOGOUT_UNCONFIRMED:'本地密码及网站管理员登录验证通过，但无法确认测试会话已退出。请报告此结果。'
 };
 return code+': '+messages[code];
}
