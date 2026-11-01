// Explicit, one-run production acceptance. Only a dedicated synthetic QA account is mutated.
// No real transfer, administrator impersonation or membership approval is performed.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
if(process.env.RUN_MANUAL_PAYMENT_ORDER_ACCEPTANCE!=='yes'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||''))throw new Error('Explicit acceptance configuration required');
const origin='https://easy-english-global.onrender.com';
const email='ee-launch-'+process.env.GITHUB_RUN_ID+'@example.invalid',password=randomBytes(32).toString('base64url');
let cookie:string|undefined,userId:string|undefined,orderId:string|undefined;
async function call(path:string,method='GET',body?:unknown){
 const r=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});
 return {response:r,data:await r.json()};
}
try{
 const catalog=await call('/catalog');assert.equal(catalog.data.features.manualPayment,true);assert.equal(catalog.data.features.mockCheckout,false);
 const register=await call('/auth/register','POST',{email,password});assert.equal(register.response.status,200);cookie=register.response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);userId=register.data.user.id;assert.equal(register.data.user.membership,'free');
 console.log(JSON.stringify({event:'manual_payment_qa_created',email,userId}));
 assert.equal((await call('/admin/orders')).response.status,403);assert.equal((await call('/orders','POST',{})).response.status,403);
 const created=await call('/orders/manual','POST',{method:'wechat',amount_fen:1,status:'paid'});assert.equal(created.response.status,200);orderId=created.data.order.id;assert.equal(created.data.order.amount_fen,9900);assert.equal(created.data.order.currency,'CNY');assert.equal(created.data.order.status,'pending');
 const duplicate=await call('/orders/manual','POST',{method:'alipay'});assert.equal(duplicate.data.order.id,orderId);
 assert.equal((await call('/orders/manual/claim','POST',{id:randomUUID()})).response.status,404);
 assert.equal((await call('/admin/orders/review','POST',{id:orderId,action:'approve',verified:true})).response.status,403);
 const claimed=await call('/orders/manual/claim','POST',{id:orderId});assert.equal(claimed.response.status,200);assert.equal(claimed.data.order.status,'payment_claimed');
 assert.equal((await call('/orders/manual/claim','POST',{id:orderId})).response.status,200);
 assert.equal((await call('/me')).data.user.membership,'free');
 assert.equal((await call('/orders')).data.orders.filter((o:any)=>o.payment_method).length,1);
 console.log(JSON.stringify({event:'manual_payment_order_acceptance',ok:true,email,userId,orderId,amountFen:9900,status:'payment_claimed',membership:'free',adminApprovalDenied:true,noMoneyTransferred:true}));
}catch{console.error('Manual payment order acceptance failed; credentials are never logged');process.exitCode=1;}
finally{
 if(cookie)try{await call('/auth/logout','POST',{});}catch{}
 console.log(JSON.stringify({event:'manual_payment_qa_cleanup_required',email,userId,orderId}));
}
