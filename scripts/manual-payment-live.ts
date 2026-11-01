// Read-only acceptance: never registers users or changes orders, memberships or learning data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const expectedPayment=JSON.parse(await readFile(new URL('../deployments/manual-payment.json',import.meta.url),'utf8')).payment.enabled===true;
const qrManifest=JSON.parse(await readFile(new URL('../docs/payment-qr-assets.json',import.meta.url),'utf8'));
import {smoke} from '../src/smoke.ts';
const origin='https://easy-english-global.onrender.com';
let last:unknown;
for(let attempt=0;attempt<12;attempt++){
 try{
  const checks=await smoke(origin);
  const get=await fetch(origin+'/api/catalog',{signal:AbortSignal.timeout(60000)});
  assert.equal(get.status,200);const catalog=await get.json();
  assert.equal(catalog.features.manualPayment,expectedPayment);assert.equal(catalog.features.mockCheckout,false);
  for(const path of ['/payments/wechat.jpg','/payments/alipay.jpg']){
   const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,expectedPayment?200:404);
   if(expectedPayment){assert.equal(response.headers.get('content-type'),'image/jpeg');const asset=qrManifest.find((a:any)=>path.endsWith('/'+a.method+'.jpg'));assert.ok(asset);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),asset.sha256);}
  }
  for(const path of ['/about','/privacy','/terms']){
   const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('Easy English Global'));assert.ok(html.includes('sdqtyc@gmail.com'));assert.ok(html.includes('href="/privacy"'));assert.ok(html.includes('href="/terms"'));
  }
  for(const path of ['/api/admin/orders','/api/orders','/api/admin/mail/gmail/status','/api/admin/mail/gmail/callback']){
   const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,401);
  }
  for(const path of ['/api/orders/manual','/api/orders/manual/claim','/api/admin/orders/review','/api/admin/orders/notify','/api/admin/mail/gmail/start','/api/admin/mail/gmail/test','/api/admin/mail/gmail/disconnect']){
   const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
   assert.equal(response.status,401);
   const cross=await fetch(origin+path,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
   assert.equal(cross.status,403);
  }
  const verification=await fetch(origin+'/googleddf3db021b6b2ec7.html',{signal:AbortSignal.timeout(30000)});assert.equal(verification.status,200);assert.equal((await verification.text()).trim(),'google-site-verification: googleddf3db021b6b2ec7.html');
  console.log(JSON.stringify({ok:true,baselineChecks:checks.length,manualPayment:expectedPayment,mockCheckout:false,anonymousAndCrossOriginWritesDenied:true,readOnly:true,brandPagesAvailable:true,siteVerificationFileAvailable:true}));
  process.exit(0);
 }catch(error){last=error;if(attempt<11)await new Promise(resolve=>setTimeout(resolve,5000));}
}
console.error('Read-only manual payment acceptance failed:',last instanceof Error?last.name:'UnknownError');process.exitCode=1;
