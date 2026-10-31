import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {database} from '../src/db.ts';
import {initializeAdmin} from '../src/admin-init.ts';
import {HttpError} from '../src/security.ts';
async function credentials(){
 if(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD)return {email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD};
 if(process.env.ADMIN_EMAIL||process.env.ADMIN_PASSWORD)throw new Error('Provide both ADMIN_EMAIL and ADMIN_PASSWORD for non-interactive initialization');
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Run in a trusted interactive terminal, or provide temporary ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
 let muted=false;
 const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
 const rl=createInterface({input:process.stdin,output,terminal:true});
 try{
  const email=await rl.question('Administrator email: ');
  process.stdout.write('Unique password (16–128 characters, input hidden): ');muted=true;
  const password=await rl.question('');process.stdout.write('\n');
  process.stdout.write('Confirm password (input hidden): ');
  const confirmation=await rl.question('');process.stdout.write('\n');
  if(password!==confirmation)throw new Error('Password confirmation did not match');
  return {email,password};
 }finally{rl.close();output.end();}
}
try{
 const values=await credentials(),pool=database();
 try{const client=await pool.connect();try{await initializeAdmin(client,values.email,values.password);console.log('First administrator created. No password is printed or saved to a file.');}finally{client.release();}}finally{await pool.end();}
}catch(error){console.error(error instanceof HttpError?error.message:'Administrator initialization failed. Check terminal input, database configuration and connectivity. Existing accounts were not overwritten.');process.exitCode=1;}
