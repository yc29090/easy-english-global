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
  else if(path==='/api/orders')data={orders:[]};
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
  assert.match(document.querySelector('h1').textContent,/选择你的英语学习版本/);await click('[data-version="classic"]');assert.match(document.querySelector('h1').textContent,/先听懂/);assert.ok(document.querySelector('[data-continue]'));assert.ok(document.querySelector('[data-page="review"]'));
  await click('[data-continue]');assert.equal(document.querySelector('.trainer-card h3').textContent,'Thank you.');assert.ok(writes.some(w=>w.path==='/api/learning-state'&&w.body.material_id==='phrase'));
  await click('[data-hide="en"]');assert.equal(document.querySelector('.trainer-card h3'),null);assert.match(document.querySelector('.trainer-card').textContent,/英文已隐藏/);
  await click('[data-hide="zh"]');assert.ok(!document.querySelector('.trainer-card').textContent.includes('谢谢。'));assert.ok(document.querySelector('[data-repeat]'));assert.ok(document.querySelector('[data-shadow]'));assert.ok(document.querySelector('[data-stop]'));
  await click('[data-page="review"]');assert.ok(document.querySelector('[data-review-mode="all"]'));await click('[data-start-review]');assert.match(document.querySelector('h1').textContent,/听说复习/);
  await click('[data-page="scenes"]');await click('[data-dialogue="d"]');assert.match(document.querySelector('.dialogue-turn').textContent,/听听对方/);
  await click('#advance-dialogue');assert.match(document.querySelector('.dialogue-turn').textContent,/轮到你/);assert.equal(savedPractice[0].turn_index,1);
  await click('[data-page="scenes"]');await click('[data-dialogue="d"]');assert.match(document.querySelector('.dialogue-turn').textContent,/轮到你/);
  await click('#advance-dialogue');assert.match(document.querySelector('.empty').textContent,/完成了一次简单交流/);assert.equal(savedPractice[0].turn_index,2);
  await click('[data-page="membership"]');assert.match(document.querySelector('h1').textContent,/一次选择/);assert.equal(document.querySelector('#create-order'),null);assert.equal(document.querySelector('[data-confirm]'),null);
  await click('[data-page="home"]');assert.ok(document.querySelector('[data-version="modern"]'));await click('[data-version="classic"]');await click('#language');assert.equal(document.documentElement.lang,'en');assert.match(document.querySelector('h1').textContent,/Listen first/);
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('learning status counts follow accessible lessons, combined filters, status writes, review mode and language',async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div><div id="notice"></div><dialog id="modal"></dialog></body></html>');
 const old={};for(const k of ['window','document','localStorage','fetch','location','history'])old[k]=globalThis[k];
 const items=[
  {id:'w1',kind:'word',english:'Hello',chinese:'你好',scene_id:'s1',difficulty:1},
  {id:'w2',kind:'word',english:'Help',chinese:'帮助',scene_id:'s1',difficulty:1},
  {id:'w3',kind:'word',english:'Airport',chinese:'机场',scene_id:'s3',difficulty:2},
  {id:'w4',kind:'word',english:'Water',chinese:'水',scene_id:'s1',difficulty:1},
  {id:'w5',kind:'word',english:'Food',chinese:'食物',scene_id:'s2',difficulty:1},
  {id:'p1',kind:'phrase',english:'Thank you.',chinese:'谢谢。',scene_id:'s1',difficulty:1}
 ].map(m=>({...m,is_free:true}));
 let progress=[{material_id:'w1',status:'learned'},{material_id:'w2',status:'unmastered'},{material_id:'w3',status:'mastered'},{material_id:'w4',status:'review'},{material_id:'p1',status:'mastered'},{material_id:'locked',status:'learned'}];
 const scenes=[{id:'s1',category:'life',title_en:'Greetings',title_zh:'招呼'},{id:'s2',category:'life',title_en:'Food',title_zh:'餐饮'},{id:'s3',category:'travel',title_en:'Airport',title_zh:'机场'}];
 Object.assign(globalThis,{window,document,location:{search:''},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){}}});window.scrollTo=()=>{};
 globalThis.fetch=async(path,options={})=>{
  let data={};
  if(path==='/api/me')data={user:{id:'u',email:'counts@example.com',role:'user',membership:'free',must_change_password:false}};
  else if(path==='/api/catalog')data={counts:[{kind:'word',count:500},{kind:'phrase',count:200}],scenes,materials:items,dialogues:[],locked:true,features:{mockCheckout:false}};
  else if(path==='/api/progress'){
   if(options.method==='PUT'){const body=JSON.parse(options.body);progress=progress.filter(p=>p.material_id!==body.material_id).concat({material_id:body.material_id,status:body.status});}
   data={progress};
  }else if(path.startsWith('/api/review'))data={items:items.filter(m=>progress.some(p=>p.material_id===m.id&&(path.endsWith('/all')||p.status==='unmastered')))};
  else if(path==='/api/practice-progress')data={practice:[]};
  else if(path==='/api/learning-state')data={state:null};
  return {ok:true,json:async()=>data};
 };
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const click=async selector=>{const el=document.querySelector(selector);assert.ok(el,selector);await el.onclick();await settle();};
 const select=async(id,value)=>{const el=document.querySelector(id);assert.ok(el,id);await el.onchange({target:{value}});await settle();};
 const counts=()=>Object.fromEntries([...document.querySelectorAll('#filter option')].map(el=>[el.value,Number(el.textContent.match(/[(（](\d+)[)）]/)[1])]));
 const visible=n=>{assert.equal(document.querySelectorAll('.materials .material').length,n);assert.match(document.querySelector('#material-count').textContent,new RegExp('(^Showing |显示 )'+n+'( items$| 条$)'));};
 try{
  await import('../public/app.js?status-counts');await settle();
  await click('[data-page="words"]');assert.deepEqual(counts(),{all:5,learned:1,unmastered:1,mastered:1,review:1});visible(5);
  await select('#category','life');assert.deepEqual(counts(),{all:4,learned:1,unmastered:1,mastered:0,review:1});
  await select('#difficulty','1');await select('#scene','s1');assert.deepEqual(counts(),{all:3,learned:1,unmastered:1,mastered:0,review:1});
  window.HTMLInputElement.prototype.setSelectionRange=()=>{};
  window.HTMLInputElement.prototype.focus=()=>{};
  await document.querySelector('#search').oninput({target:{value:'hel',selectionStart:3}});await settle();
  assert.deepEqual(counts(),{all:2,learned:1,unmastered:1,mastered:0,review:0});visible(2);
  await select('#filter','mastered');visible(0);assert.equal(counts().all,2);assert.equal(counts().unmastered,1);
  await select('#filter','unmastered');visible(1);
  await click('[data-material="w2"][data-status="mastered"]');visible(0);assert.deepEqual(counts(),{all:2,learned:1,unmastered:0,mastered:1,review:0});
  await select('#filter','all');visible(2);
  await click('#language');assert.match(document.querySelector('#filter option').textContent,/All states \(2\)/);assert.equal(document.querySelector('#material-count').textContent,'Showing 2 items');
  await click('[data-page="phrases"]');assert.deepEqual(counts(),{all:1,learned:0,unmastered:0,mastered:1,review:0});visible(1);
  await click('[data-page="review"]');assert.equal(counts().all,0);visible(0);
  await click('[data-review-mode="all"]');assert.deepEqual(counts(),{all:5,learned:1,unmastered:0,mastered:3,review:1});visible(5);
  await click('[data-page="scenes"]');assert.equal(counts().all,6);visible(6);
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
