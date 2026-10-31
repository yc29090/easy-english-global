import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderMailer} from '../src/mail.ts';
import type {RuntimeConfig} from '../src/config.ts';
const config:RuntimeConfig={production:false,appUrl:'http://localhost:3000',port:3000,mockCheckout:false,mailProvider:'resend',mailFrom:'Easy English <orders@example.com>',resendKey:'fake-test-key'};
test('order notification: verified destination, fixed amount and no secrets in message',async()=>{
 let count=0;
 const send=orderMailer(config,async(_url,options)=>{
  count++;
  const req=JSON.parse(String(options?.body));
  assert.deepEqual(req.to,['sdqtyc@gmail.com']);
  assert.match(req.text,/99 元/);
  assert.match(req.text,/尚未核实到账/);
  assert.match(req.text,/order-123/);
  assert.ok(!req.text.includes('fake-test-key'));
  return {ok:true} as Response;
 });
 await send({id:'order-123',email:'learner@example.com',method:'wechat'});
 assert.equal(count,1);
});
test('order notification: disabled provider does not send',async()=>{
 let called=false;
 const send=orderMailer({...config,mailProvider:'disabled'},async()=>{called=true;throw new Error('should not send');});
 await send({id:'order-123',email:'learner@example.com',method:'alipay'});
 assert.equal(called,false);
});
test('order notification: provider failure surfaces to caller',async()=>{
 const send=orderMailer(config,async()=>({ok:false} as Response));
 await assert.rejects(()=>send({id:'order-123',email:'learner@example.com',method:'wechat'}),/delivery failed/);
});
