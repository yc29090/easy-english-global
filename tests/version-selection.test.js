import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
let sequence=0;
async function screen({user=null,search='',loginUser}={},run){
 const {window,document}=parseHTML('<html><body><div id="app"></div><div id="notice"></div><dialog id="modal"></dialog></body></html>');
 const keys=['window','document','localStorage','fetch','location','history','FormData'],old=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 const requests=[],routes=[],progress=[{material_id:'word',status:'mastered',next_review_at:'2030-01-01'}];let session=user;
 const item={id:'word',kind:'word',english:'Hello',chinese:'你好',scene_id:'s',difficulty:1,is_free:true};
 const dialog=document.querySelector('#modal');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};window.scrollTo=()=>{};
 const location={search};const move=url=>{routes.push(url);location.search=new URL(url,'https://example.invalid').search;};
 class FormData{constructor(form){this.values=[...form.querySelectorAll('input[name]')].map(i=>[i.name,i.value]);}*[Symbol.iterator](){yield* this.values;}}
 Object.assign(globalThis,{window,document,location,FormData,history:{pushState:(_s,_t,url)=>move(url),replaceState:(_s,_t,url)=>move(url)},localStorage:{getItem:()=>null,setItem(){}}});
 globalThis.fetch=async(path,options={})=>{
  const method=options.method||'GET';requests.push({path,method});let data={};
  if(path==='/api/me'){if(!session)return {ok:false,status:401,json:async()=>({error:'Please sign in'})};data={user:session};}
  else if(path==='/api/catalog')data={counts:[{kind:'word',count:500},{kind:'phrase',count:200}],materials:[item],scenes:[{id:'s',title_zh:'见面',title_en:'Greeting'}],dialogues:[],features:{manualPayment:false,mockCheckout:false},locked:!session?.hasAccess};
  else if(path==='/api/auth/login'||path==='/api/auth/register')session=loginUser;
  else if(path==='/api/auth/logout')session=null;
  else if(path==='/api/progress')data={progress};
  else if(path==='/api/learning-state')data={state:{last_material_id:'word'}};
  else if(path==='/api/practice-progress')data={practice:[]};
  else if(path==='/api/orders')data={orders:[]};
  else if(path==='/api/admin/users')data={users:[]};
  else if(path==='/api/admin/orders')data={orders:[]};
  else if(path.startsWith('/api/review'))data={items:[]};
  else throw Error('Unexpected request '+path);
  return {ok:true,status:200,json:async()=>data};
 };
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const click=async selector=>{const el=document.querySelector(selector);assert.ok(el,selector);await el.onclick({preventDefault(){}});await settle();};
 try{await import('../public/app.js?version-selector='+sequence++);await settle();await run({document,window,location,routes,requests,progress,click,settle});}
 finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}
const learner={id:'u',email:'selector@example.invalid',role:'user',membership:'free',hasAccess:false,must_change_password:false};
test('version homepage exposes equal working links and shared membership without saving or granting access',async()=>{
 await screen({user:learner},async({document,click,requests,progress})=>{
  assert.match(document.querySelector('h1').textContent,/选择你的英语学习版本/);assert.equal(document.querySelectorAll('.version-cards .version-card').length,2);
  assert.equal(document.querySelector('[data-version="classic"]').getAttribute('href'),'/?version=classic');assert.equal(document.querySelector('[data-version="modern"]').getAttribute('href'),'/ogden');
  assert.match(document.querySelector('.version-shared').textContent,/99元终身会员权益共用/);assert.equal(document.querySelector('[data-page="admin"]'),null);
  await click('[data-version="classic"]');assert.match(document.querySelector('h1').textContent,/先听懂/);
  await click('[data-page="words"]');assert.equal(document.querySelector('[data-status="mastered"]').getAttribute('aria-pressed'),'true');
  await click('[data-page="home"]');await click('[data-version="classic"]');await click('[data-page="words"]');assert.equal(document.querySelector('[data-status="mastered"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(progress.map(p=>p.status),['mastered']);assert.ok(requests.every(r=>r.method==='GET'));
 });
});
test('classic deep links and browser back retain a version selector instead of resetting learning records',async()=>{
 await screen({user:learner,search:'?version=classic&page=words'},async({document,window,location,click,settle})=>{
  assert.ok(document.querySelector('.materials'));await click('[data-page="home"]');assert.ok(document.querySelector('.version-picker'));
  location.search='?version=classic';window.dispatchEvent(new window.Event('popstate'));await settle();assert.match(document.querySelector('h1').textContent,/先听懂/);
 });
});
test('sign-in from a classic lesson returns to version choice, not a stale lesson or arbitrary redirect',async()=>{
 await screen({search:'?version=classic&page=words&next=https://untrusted.invalid',loginUser:learner},async({document,click,routes})=>{
  await click('[data-auth="login"]');const form=document.querySelector('#auth-form');form.querySelector('[name=email]').value=learner.email;form.querySelector('[name=password]').value='Synthetic-login-only9!';
  await form.onsubmit({preventDefault(){},target:form});assert.ok(document.querySelector('.version-picker'));assert.equal(routes.at(-1),'/');assert.equal(document.querySelector('#modal').open,false);
 });
});
test('modern login link opens the existing login and mandatory temporary-password changes still take priority',async()=>{
 await screen({search:'?login=1'},async({document})=>{assert.equal(document.querySelector('#modal').open,true);assert.ok(document.querySelector('#auth-form'));});
 await screen({user:{...learner,must_change_password:true},search:'?version=classic'},async({document})=>{assert.ok(document.querySelector('#change-password'));assert.equal(document.querySelector('.version-picker'),null);});
});
test('ordinary accounts cannot open administrator UI through new routes; existing admin and lifetime identities are retained',async()=>{
 await screen({user:learner,search:'?page=admin'},async({document,requests})=>{assert.ok(document.querySelector('#change-password'));assert.equal(document.querySelector('#trial-form'),null);assert.ok(!requests.some(r=>r.path.startsWith('/api/admin/')));});
 await screen({user:{...learner,role:'admin',membership:'lifetime',hasAccess:true}},async({document,click})=>{assert.ok(document.querySelector('[data-page="admin"]'));await click('[data-page="admin"]');assert.ok(document.querySelector('#trial-form'));});
});
