import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../src/http.ts';

test('brand homepage and policy pages are public, readable without JavaScript, and never access account data',async()=>{
 let databaseAccesses=0;
 const pool={query:async()=>{databaseAccesses++;throw new Error('No database access allowed');},connect:async()=>{databaseAccesses++;throw new Error('No account connection allowed');}};
 const server=createApplication(pool,{production:false,appUrl:'http://localhost',port:3000,mockCheckout:false,manualPayment:true,mailProvider:'disabled',mailFrom:''},async()=>{});
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a!=='string');const base='http://127.0.0.1:'+a.port;
  for(const path of ['/','/about','/privacy','/terms']){
   const response=await fetch(base+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type')||'',/text\/html/);assert.ok(response.headers.get('content-security-policy'));
   const html=await response.text();assert.match(html,/Easy English Global/);assert.match(html,/sdqtyc@gmail\.com/);assert.match(html,/href="\/privacy"/);assert.match(html,/href="\/terms"/);
   assert.equal((await fetch(base+path,{method:'HEAD'})).status,200);assert.equal((await fetch(base+path,{method:'POST'})).status,404);
   if(path==='/privacy'){assert.match(html,/gmail\.send/);assert.match(html,/Limited Use/);assert.match(html,/撤销/);assert.match(html,/删除/);assert.doesNotMatch(html,/<script/);}
   if(path==='/terms'){assert.match(html,/99元/);assert.match(html,/真实到账/);}
  }
  assert.equal((await fetch(base+'/privacy/../../.env')).status,404);assert.equal((await fetch(base+'/unknown-policy')).status,404);assert.equal(databaseAccesses,0);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
