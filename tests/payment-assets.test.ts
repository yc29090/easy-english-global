import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApplication} from '../src/http.ts';
import type {RuntimeConfig} from '../src/config.ts';

test('receiving QR originals remain inaccessible while payments are closed; exact JPEG assets when enabled',async()=>{
 const pool={query:async()=>({rows:[]}),connect:async()=>{throw new Error('Static assets must not access user data');}};
 const config:RuntimeConfig={production:false,appUrl:'http://localhost',port:3000,mockCheckout:false,manualPayment:false,mailProvider:'disabled',mailFrom:''};
 const server=createApplication(pool,config,async()=>{});
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
  const manifest=JSON.parse(await readFile(new URL('../docs/payment-qr-assets.json',import.meta.url),'utf8'));
  for(const asset of manifest){
   const path='/payments/'+asset.method+'.jpg';
   assert.equal((await fetch(base+path)).status,404);
   config.manualPayment=true;
   const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
   assert.equal((await fetch(base+path,{method:'HEAD'})).status,200);
   assert.equal((await fetch(base+path,{method:'POST'})).status,404);
   config.manualPayment=false;
  }
  assert.equal((await fetch(base+'/payments/unknown.jpg')).status,404);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
