import type {RuntimeConfig} from './config.ts';
export function resetMailer(config:RuntimeConfig,fetcher:typeof fetch=fetch){return async(to:string,url:string)=>{
 const text=`请在 30 分钟内打开此链接重置密码 / Reset your password within 30 minutes:\n${url}\n如非本人操作，请忽略此邮件。`;
 if(config.mailProvider==='resend'){
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.resendKey,'Content-Type':'application/json'},body:JSON.stringify({from:config.mailFrom,to:[to],subject:'Easy English · 重置密码 / Reset password',text}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Password reset delivery failed');
  return;
 }
 if(config.mailProvider==='smtp'&&config.smtp){
  const {default:nodemailer}=await import('nodemailer');
  const smtp=config.smtp;const transport=nodemailer.createTransport({host:smtp.host,port:smtp.port,secure:smtp.port===465,requireTLS:smtp.port!==465,auth:{user:smtp.user,pass:smtp.pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000});
  await transport.sendMail({from:config.mailFrom,to,subject:'Easy English · 重置密码 / Reset password',text});return;
 }
 throw new Error('Password reset delivery is disabled');
};}
