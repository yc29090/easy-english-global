// CI-only boot check after installing runtime dependencies without devDependencies.
import pg from 'pg';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {smoke} from '../src/smoke.ts';
import assert from 'node:assert/strict';
const connection=process.env.TEST_DATABASE_URL;
if(!connection)throw new Error('TEST_DATABASE_URL must point to an isolated CI PostgreSQL instance');
const schema='ee_boot_'+randomUUID().replaceAll('-',''),client=new pg.Client({connectionString:connection});
await client.connect();
try{
 await client.query('CREATE SCHEMA '+schema);
 const url=new URL(connection);url.searchParams.set('options','-c search_path='+schema);
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const address=socket.address();if(!address||typeof address==='string')throw new Error('Cannot allocate test port');const port=address.port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
 const testEmail='runtime-'+randomUUID()+'@example.invalid',testPassword='Runtime9!isolated-fixture',requestId=randomUUID();
 let previousProgress:unknown;
 for(let boot=1;boot<=2;boot++){
  const base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['scripts/render-start.ts'],{env:{...process.env,NODE_ENV:'test',RENDER:'false',DATABASE_URL:url.toString(),DATABASE_SSL:'disable',PORT:String(port),APP_URL:base,MAIL_PROVIDER:'disabled',ALLOW_MOCK_CHECKOUT:'false',OGDEN_PUBLISHED:'true'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
  try{
   let healthy=false;
   for(let attempt=0;attempt<90;attempt++){
    if(child.exitCode!==null)throw new Error('Runtime startup exited before readiness');
    try{healthy=(await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).status===200;}catch{}
    if(healthy)break;await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!healthy)throw new Error('Runtime did not become ready');
   const checks=await smoke(base);console.log('Boot '+boot+': '+checks.length+' local runtime checks passed');
   const post=(path:string,body:unknown,cookie='')=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
   const auth=await post('/api/auth/'+(boot===1?'register':'login'),{email:testEmail,password:testPassword});assert.equal(auth.status,200);
   const cookie=auth.headers.get('set-cookie')!.split(';')[0];
   const catalog=await(await fetch(base+'/api/ogden/catalog',{headers:{Cookie:cookie}})).json();assert.equal(catalog.items.filter((x:any)=>x.kind==='word').length,850);assert.equal(catalog.items.filter((x:any)=>x.kind==='operator').length,18);
   const result=await post('/api/ogden/results',{item_id:'ow-get',mode:'listening',status:'review',request_id:requestId},cookie);assert.equal(result.status,200);assert.equal((await result.json()).duplicate,boot===2?true:undefined);
   const progress=await(await fetch(base+'/api/ogden/progress',{headers:{Cookie:cookie}})).json();assert.equal(progress.practice.length,1);assert.equal(progress.practice[0].attempts,1);
   if(boot===2)assert.deepEqual(progress,previousProgress);previousProgress=progress;
   console.log('Boot '+boot+': publication curriculum, login and idempotent progress survived actual runtime startup');
  }finally{
   if(child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await Promise.race([done,new Promise<void>((resolve)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},12000);timer.unref();})]);}
  }
 }
}finally{await client.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await client.end();}
