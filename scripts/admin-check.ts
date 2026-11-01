import {promptAdminInput,adminConnectionOptions,adminErrorMessage,AdminInputError} from '../src/admin-terminal.ts';
import type {AdminInput} from '../src/admin-terminal.ts';
import {checkAdminLogin,adminLoginCheckMessage} from '../src/admin-login-check.ts';
let input:AdminInput|undefined;
try{
 if(Number(process.versions.node.split('.')[0])!==24)throw new AdminInputError('version');
 if(process.argv.length!==2)throw new AdminInputError('tty');
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new AdminInputError('configuration');
 input=await promptAdminInput(process.stdin,process.stdout,'verify');
 const {default:pg}=await import('pg');
 const pool=new pg.Pool(adminConnectionOptions(input.databaseUrl));pool.on('error',()=>{});
 try{
  const client=await pool.connect();
  try{
   const stream=(client as unknown as {connection:{stream:import('node:tls').TLSSocket}}).connection.stream;
   if(!stream.encrypted||!stream.authorized)throw new AdminInputError('configuration');
   // The database part is enforced read-only. HTTP login creates only a temporary
   // session, which the check logs out; it never writes roles or passwords.
   await client.query('BEGIN READ ONLY');
   try{const result=await checkAdminLogin(client,input.email,input.password);console.log(adminLoginCheckMessage(result));if(result!=='WEBSITE_LOGIN_OK')process.exitCode=1;}
   finally{await client.query('ROLLBACK');}
  }finally{client.release();}
 }finally{await pool.end();}
}catch(error){console.error(error instanceof AdminInputError?'检查未完成。'+adminErrorMessage(error):'检查未完成。请检查网络和数据库连接；没有修改账号，不要重新初始化管理员。');process.exitCode=error instanceof AdminInputError&&error.kind==='cancelled'?130:1;}
finally{if(input){input.databaseUrl='';input.email='';input.password='';input=undefined;}}
