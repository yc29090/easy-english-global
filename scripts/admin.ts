import {promptAdminInput,adminConnectionOptions,adminErrorMessage,AdminInputError} from '../src/admin-terminal.ts';
import {initializeAdmin} from '../src/admin-init.ts';
import type {AdminInput} from '../src/admin-terminal.ts';

let values:AdminInput|undefined;
try{
 if(Number(process.versions.node.split('.')[0])!==24)throw new AdminInputError('version');
 if(process.argv.length!==2)throw new AdminInputError('tty');
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new AdminInputError('configuration');
 // No dotenv loading, argv credentials, ADMIN_* or DATABASE_URL environment fallback.
 values=await promptAdminInput();
 const {default:pg}=await import('pg');
 const pool=new pg.Pool(adminConnectionOptions(values.databaseUrl));
 pool.on('error',()=>{}); // Never let an idle-client error print sensitive driver details.
 try{
  const client=await pool.connect();
  try{
   const stream=(client as unknown as {connection:{stream:import('node:tls').TLSSocket}}).connection.stream;
   if(!stream.encrypted||!stream.authorized)throw new AdminInputError('configuration');
   await initializeAdmin(client,values.email,values.password,values.currentPassword);
   console.log('管理员创建成功。连接已通过 TLS 证书验证；请到网站登录，不要再次初始化。');
  }finally{client.release();}
 }finally{await pool.end();}
}catch(error){
 console.error(adminErrorMessage(error));
 process.exitCode=error instanceof AdminInputError&&error.kind==='cancelled'?130:1;
}finally{if(values){values.databaseUrl='';values.email='';values.password='';values.currentPassword='';values=undefined;}}
