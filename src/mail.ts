import nodemailer from 'nodemailer';
export async function sendReset(to:string,url:string){
 if(!process.env.SMTP_HOST)throw new Error('SMTP is not configured');
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
 await transport.sendMail({from:process.env.MAIL_FROM,to,subject:'Easy English · 重置密码 / Reset password',text:`请在 30 分钟内打开此链接重置密码 / Reset your password within 30 minutes:\n${url}\n如非本人操作，请忽略此邮件。`});
}
