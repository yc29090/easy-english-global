import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {databaseOptions} from './config.ts';
import {adminPassword} from './admin-init.ts';
import {email,HttpError,requireValue} from './security.ts';

export type AdminInput={databaseUrl:string;email:string;password:string;currentPassword?:string};
export class AdminInputError extends Error {
 kind:'tty'|'cancelled'|'mismatch'|'configuration'|'version';
 constructor(kind:AdminInputError['kind']){super(kind);this.kind=kind;}
}
export function adminConnectionOptions(databaseUrl:string){
 // A local configuration object, never process.env or an environment/file write.
 return databaseOptions({NODE_ENV:'production',DATABASE_SSL:'verify-full',DATABASE_URL:databaseUrl});
}
export function adminErrorMessage(error:unknown){
 if(error instanceof AdminInputError){
  const messages={
   tty:'需要在手机 Termux 或本地交互终端运行，不能通过管道、参数或环境变量提供凭据。',
   cancelled:'已取消输入。没有提交管理员创建请求。',
   mismatch:'两次密码不一致。没有连接数据库或创建管理员，请重新运行。',
   configuration:'配置不安全或数据库连接格式无效。请检查 Node 设置及 Neon 连接信息；不要关闭 TLS 验证。',
   version:'请使用 Node.js 24（Termux 的 nodejs-lts），再运行本命令。'
  };return messages[error.kind];
 }
 if(error instanceof HttpError&&error.status===403)return '原账号验证失败。请检查原登录密码和账号状态；没有创建或提升管理员。';
 if(error instanceof HttpError&&error.status===409)return '初始化已关闭或邮箱已被使用。没有覆盖或提升任何已有账号；已有账号需输入原登录密码；若已有管理员，请直接登录。';
 if(error instanceof HttpError&&error.status===400)return '邮箱或密码不符合要求。密码需 16–128 位、至少三类字符，不能使用默认密码；输入内容不会显示。';
 return '初始化失败或结果未确认。请检查网络及 Neon 项目；若连接中断，请先尝试网站登录。不要删除用户、重置数据库或发送任何凭据。';
}

export async function promptAdminInput(input:NodeJS.ReadStream=process.stdin,output:NodeJS.WriteStream=process.stdout,mode:'initialize'|'verify'='initialize'):Promise<AdminInput>{
 if(!input.isTTY||!output.isTTY||typeof input.setRawMode!=='function')throw new AdminInputError('tty');
 const wasRaw=!!input.isRaw,wasPaused=input.isPaused();
 // Suppress every readline write, including typed input, cursor redraws and paste.
 // Email is hidden too, so a multiline paste can never echo a following secret.
 const muted=new Writable({write(_chunk,_encoding,callback){callback();}});
 const rl=createInterface({input,output:muted,terminal:true,historySize:0});
 const abort=new AbortController();let complete=false;
 const cancel=()=>{abort.abort();rl.close();};
 const onClose=()=>{if(!complete)abort.abort();};
 rl.on('SIGINT',cancel);rl.on('SIGTSTP',cancel);rl.on('close',onClose);
 const signals=['SIGINT','SIGTERM','SIGHUP','SIGTSTP'] as const;
 for(const signal of signals)process.on(signal,cancel);
 let databaseUrl='',address='',password='',confirmation='',currentPassword='';
 async function ask(prompt:string){
  output.write(prompt);
  try{return await rl.question('',{signal:abort.signal});}finally{output.write('\n');}
 }
 try{
  const total=mode==='verify'?3:5;
  databaseUrl=await ask(`[1/${total}] Neon 数据库连接字符串（隐藏输入，粘贴后按回车）：`);
  try{adminConnectionOptions(databaseUrl);}catch{throw new AdminInputError('configuration');}
  address=email(await ask(`[2/${total}] 管理员邮箱（隐藏输入）：`));
  if(mode==='verify'){
   password=await ask('[3/3] 新管理员密码（隐藏输入，仅检查，不修改）：');
   requireValue(password.length>0&&password.length<=128);
   return {databaseUrl,email:address,password};
  }
  currentPassword=await ask('[3/5] 原网站登录密码（已有账号必须输入，新邮箱直接回车；隐藏输入）：');
  password=await ask('[4/5] 管理员密码（隐藏输入，16–128 位，至少三类字符）：');
  adminPassword(password);
  confirmation=await ask('[5/5] 再次输入管理员密码（隐藏输入）：');
  if(password!==confirmation)throw new AdminInputError('mismatch');
  return {databaseUrl,email:address,password,currentPassword};
 }catch(error){if(abort.signal.aborted)throw new AdminInputError('cancelled');throw error;}
 finally{
  complete=true;
  for(const signal of signals)process.removeListener(signal,cancel);
  rl.removeListener('SIGINT',cancel);rl.removeListener('SIGTSTP',cancel);rl.removeListener('close',onClose);
  rl.close();muted.end();
  input.setRawMode(wasRaw);if(wasPaused)input.pause();
  // Drop references; JavaScript strings are not claimed to be physically zeroized.
  databaseUrl='';address='';password='';confirmation='';currentPassword='';
 }
}
