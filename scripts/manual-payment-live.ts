// Read-only acceptance: never registers users or changes orders, memberships or learning data.
import assert from 'node:assert/strict';
import {smoke} from '../src/smoke.ts';
const origin='https://easy-english-global.onrender.com';
let last:unknown;
for(let attempt=0;attempt<12;attempt++){
 try{
  const checks=await smoke(origin);
  const get=await fetch(origin+'/api/catalog',{signal:AbortSignal.timeout(60000)});
  assert.equal(get.status,200);const catalog=await get.json();
  assert.equal(catalog.features.manualPayment,false);assert.equal(catalog.features.mockCheckout,false);
  for(const path of ['/payments/wechat.jpg','/payments/alipay.jpg']){
   const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,404);
  }
  for(const path of ['/api/admin/orders','/api/orders']){
   const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,401);
  }
  for(const path of ['/api/orders/manual','/api/orders/manual/claim','/api/admin/orders/review','/api/admin/orders/notify']){
   const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
   assert.equal(response.status,401);
   const cross=await fetch(origin+path,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
   assert.equal(cross.status,403);
  }
  console.log(JSON.stringify({ok:true,baselineChecks:checks.length,manualPayment:false,mockCheckout:false,anonymousAndCrossOriginWritesDenied:true,readOnly:true}));
  process.exit(0);
 }catch(error){last=error;if(attempt<11)await new Promise(resolve=>setTimeout(resolve,5000));}
}
console.error('Read-only manual payment acceptance failed:',last instanceof Error?last.name:'UnknownError');process.exitCode=1;
