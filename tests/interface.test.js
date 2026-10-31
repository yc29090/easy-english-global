import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

// Exercise rendered UI flows with a DOM and stubbed network. These do not replace device/audio QA.
test('adult-beginner UI: continue, hide text, review, role-play and cloud resume',async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div><div id="notice"></div><dialog id="modal"></dialog></body></html>');
 const old={};for(const k of ['window','document','localStorage','fetch','location','history'])old[k]=globalThis[k];
 const writes=[],items=[{id:'word',kind:'word',english:'Hello',chinese:'你好',scene_id:'s',is_free:true},{id:'phrase',kind:'phrase',english:'Thank you.',chinese:'谢谢。',scene_id:'s',is_free:true}];
 const dialogue={id:'d',category:'life',title_en:'A greeting',title_zh:'打招呼',roles:{a:{zh:'你',en:'You'},b:{zh:'朋友',en:'Friend'}},turns:[{role:'b',english:'Hello!',chinese:'你好！'},{role:'a',english:'Hi!',chinese:'你好！'}]};
 let savedPractice=[];const learner={id:'u',email:'adult@example.com',role:'user',membership:'free',must_change_password:false};
 const storage=new Map();Object.assign(globalThis,{window,document,location:{search:''},history:{replaceState(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});window.scrollTo=()=>{};
 globalThis.fetch=async(path,options={})=>{
  const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
  if(body)writes.push({path,body});
  let data={};
  if(path==='/api/me')data={user:learner};
  else if(path==='/api/catalog')data={counts:[{kind:'word',count:1},{kind:'phrase',count:1}],scenes:[{id:'s',title_zh:'招呼',title_en:'Greetings'}],materials:items,dialogues:[dialogue],locked:true,features:{mockCheckout:false,passwordReset:true}};
  else if(path==='/api/progress')data={progress:[{material_id:'word',status:'unmastered',next_review_at:'2020-01-01T00:00:00Z'}]};
  else if(path==='/api/learning-state')data={state:{last_material_id:'phrase'}};
  else if(path.startsWith('/api/review'))data={items:[{...items[0],status:'unmastered',next_review_at:'2020-01-01T00:00:00Z'}]};
  else if(path==='/api/practice-progress'){if(method==='PUT')savedPractice=[{...body,completed_count:body.turn_index===2?1:0}];data={practice:savedPractice};}
  return {ok:true,json:async()=>data};
 };
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const click=async selector=>{const el=document.querySelector(selector);assert.ok(el,selector);await el.onclick();await settle();};
 try{
  await import('../public/app.js');await settle();
  assert.match(document.querySelector('h1').textContent,/先听懂/);assert.ok(document.querySelector('[data-continue]'));assert.ok(document.querySelector('[data-page="review"]'));
  await click('[data-continue]');assert.equal(document.querySelector('.trainer-card h3').textContent,'Thank you.');assert.ok(writes.some(w=>w.path==='/api/learning-state'&&w.body.material_id==='phrase'));
  await click('[data-hide="en"]');assert.equal(document.querySelector('.trainer-card h3'),null);assert.match(document.querySelector('.trainer-card').textContent,/英文已隐藏/);
  await click('[data-hide="zh"]');assert.ok(!document.querySelector('.trainer-card').textContent.includes('谢谢。'));assert.ok(document.querySelector('[data-repeat]'));assert.ok(document.querySelector('[data-shadow]'));assert.ok(document.querySelector('[data-stop]'));
  await click('[data-page="review"]');assert.ok(document.querySelector('[data-review-mode="all"]'));await click('[data-start-review]');assert.match(document.querySelector('h1').textContent,/听说复习/);
  await click('[data-page="scenes"]');await click('[data-dialogue="d"]');assert.match(document.querySelector('.dialogue-turn').textContent,/听听对方/);
  await click('#advance-dialogue');assert.match(document.querySelector('.dialogue-turn').textContent,/轮到你/);assert.equal(savedPractice[0].turn_index,1);
  await click('[data-page="scenes"]');await click('[data-dialogue="d"]');assert.match(document.querySelector('.dialogue-turn').textContent,/轮到你/);
  await click('#advance-dialogue');assert.match(document.querySelector('.empty').textContent,/完成了一次简单交流/);assert.equal(savedPractice[0].turn_index,2);
  await click('[data-page="membership"]');assert.equal(document.querySelector('#create-order'),null);assert.equal(document.querySelector('[data-confirm]'),null);
  await click('[data-page="home"]');await click('#language');assert.equal(document.documentElement.lang,'en');assert.match(document.querySelector('h1').textContent,/Listen first/);
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
