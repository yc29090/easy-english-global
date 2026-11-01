import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

test('live manual membership copy matches enabled state and displays the correct receiving QR',async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div><div id="notice"></div><dialog id="modal"></dialog></body></html>');
 const keys=['window','document','localStorage','fetch','location','history'],old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 const learner={id:'u',email:'buyer@example.com',role:'user',membership:'free',must_change_password:false};
 const features={manualPayment:true,mockCheckout:false,passwordReset:true};
 const item={id:'word',kind:'word',english:'Hello',chinese:'你好',scene_id:'s',is_free:true};
 const order={id:'2fe6c3cb-270c-4f65-b407-f402486db96a',amount_fen:9900,currency:'CNY',payment_method:'wechat',status:'pending'};
 Object.assign(globalThis,{window,document,location:{search:''},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem:()=>{}}});window.scrollTo=()=>{};
 globalThis.fetch=async path=>{
  let data={};
  if(path==='/api/me')data={user:learner};
  else if(path==='/api/catalog')data={counts:[{kind:'word',count:1},{kind:'phrase',count:0}],scenes:[{id:'s',title_zh:'招呼',title_en:'Greetings'}],materials:[item],dialogues:[],locked:true,features};
  else if(path==='/api/orders')data={orders:[order]};
  else if(path==='/api/progress')data={progress:[]};
  else if(path==='/api/learning-state')data={state:null};
  else if(path==='/api/practice-progress')data={practice:[]};
  return {ok:true,json:async()=>data};
 };
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const click=async selector=>{assert.ok(document.querySelector(selector),selector);await document.querySelector(selector).onclick();await settle();};
 try{
  await import('../public/app.js');await settle();await click('[data-page="membership"]');
  assert.match(document.querySelector('.banner').textContent,/人工扫码收款/);assert.doesNotMatch(document.querySelector('.banner').textContent,/测试期间不收取费用/);
  assert.ok(document.querySelector('#manual-order-form'));assert.equal(document.querySelector('.payment-instructions img').getAttribute('src'),'/payments/wechat.jpg');
  assert.match(document.querySelector('.payment-instructions').textContent,/杨超/);assert.match(document.querySelector('.payment-instructions').textContent,new RegExp(order.id));assert.ok(document.querySelector('[data-claim]'));
  order.payment_method='alipay';await click('[data-page="membership"]');assert.equal(document.querySelector('.payment-instructions img').getAttribute('src'),'/payments/alipay.jpg');assert.match(document.querySelector('.payment-instructions').textContent,/蜻蜓用车/);
  order.status='payment_claimed';await click('[data-page="membership"]');assert.equal(document.querySelector('.payment-instructions img'),null);assert.equal(document.querySelector('[data-claim]'),null);assert.equal(learner.membership,'free');
  features.manualPayment=false;await click('[data-page="home"]');await click('[data-page="membership"]');assert.equal(document.querySelector('#manual-order-form'),null);assert.match(document.querySelector('.banner').textContent,/测试期间不收取费用/);
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
