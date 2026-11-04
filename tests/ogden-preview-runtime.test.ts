import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createServer} from 'node:net';
async function freePort(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;await new Promise<void>(r=>server.close(()=>r()));return port;}
async function preview(port:number){
 const child=spawn(process.execPath,['scripts/ogden-preview.ts'],{cwd:new URL('../',import.meta.url),env:{...process.env,NODE_ENV:'test',OGDEN_PREVIEW_HOST:'127.0.0.1',OGDEN_PREVIEW_PORT:String(port),DATABASE_URL:'postgres://must-not-connect.invalid/production',MAIL_PROVIDER:'smtp',MANUAL_PAYMENT_ENABLED:'true',ALLOW_MOCK_CHECKOUT:'true'},stdio:['ignore','pipe','pipe']});child.stdout?.resume();child.stderr?.resume();
 let exited=false;child.once('exit',()=>exited=true);const stop=async()=>{if(exited)return;const done=new Promise<void>(r=>child.once('exit',()=>r()));child.kill('SIGTERM');const forced=setTimeout(()=>child.kill('SIGKILL'),5000);await done;clearTimeout(forced);};
 try{const deadline=Date.now()+60000;while(Date.now()<deadline&&!exited){try{const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});if(response.ok)return {stop,base:`http://127.0.0.1:${port}`};}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Isolated preview did not become ready');}catch(e){await stop();throw e;}
}
test('actual preview ignores external database/mail/payment settings, resets synthetic data on restart and never enables orders',{timeout:150000},async()=>{
 const port=await freePort();let server=await preview(port);const email='runtime@example.invalid',password='Runtime9!Fixture';let cookie='';
 const post=(path:string,body:any)=>fetch(server.base+path,{method:'POST',headers:{Origin:server.base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 try{
  const registered=await post('/api/auth/register',{email,password});assert.equal(registered.status,200);cookie=registered.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await fetch(server.base+'/api/ogden/progress',{headers:{Cookie:cookie}})).status,200);assert.equal((await post('/api/orders',{})).status,403);assert.equal((await post('/api/auth/forgot',{email})).status,403);
 }finally{await server.stop();}
 server=await preview(port);try{assert.equal((await fetch(server.base+'/api/ogden/progress',{headers:{Cookie:cookie}})).status,401);assert.equal((await post('/api/auth/login',{email,password})).status,401);assert.equal((await post('/api/orders',{})).status,403);}finally{await server.stop();}
});
