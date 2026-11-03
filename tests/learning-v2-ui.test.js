import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createLearningV2} from '../public/learning-v2.js';
test('V2 UI: hidden listening, Chinese-first speaking, token definitions, patterns and independent review',async()=>{
 const {document}=parseHTML('<html><body><div id="learning-v2-root"></div></body></html>'),old=globalThis.document;globalThis.document=document;
 const word={id:'w',english:'morning',chinese:'早上',kind:'word',is_free:true,forms:['morning']},phrase={id:'p',english:'Good morning.',chinese:'早上好。',kind:'phrase',is_free:true};
 const variant={id:'v',english:'Good evening.',chinese:'晚上好。',template_en:'Good ….',template_zh:'问候'};
 const writes=[],plays=[];let stopped=0,dialogue;
 const request=async(path,method,body)=>{
  if(method==='POST'){writes.push({path,body});return {ok:true};}
  if(path.includes('/links?')){const id=new URL('https://test.invalid'+path).searchParams.get('material_id');return {source:id==='w'?word:phrase,materials:id==='w'?[phrase]:[word],dialogues:[{id:'d',title_zh:'见面',title_en:'Greeting'}]};}
  if(path==='/learning-v2/analytics')return {ordinary:[{kind:'word',studied:2,mastered:1,unmastered:1,due:1}],practice:[{mode:'listening',attempts:1,weak:1,due:0}],weaknesses:[{target_id:'p',mode:'listening',chinese:'早上好。'}]};
  if(path==='/learning-v2/patterns')return {variants:[variant]};
  if(path.startsWith('/learning-v2/review'))return {exercises:[{target_id:'p',mode:'listening',chinese:'早上好。',last_succeeded:false}],related:[word]};
  throw new Error('Unexpected request');
 };
 const view=createLearningV2({request,getUser:()=>({id:'u'}),getCatalog:()=>({materials:[word,phrase]}),getLanguage:()=> 'zh',playback:{play:(m,o)=>plays.push({m,o}),stop:()=>{stopped++;}},signIn:()=>assert.fail('Already signed in'),openDialogue:id=>{dialogue=id;}});
 const click=async selector=>{const el=document.querySelector(selector);assert.ok(el,selector);await el.onclick?.();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
 try{
  view.open('listening','p');await view.mount();assert.ok(!document.body.textContent.includes('Good morning.'));assert.ok(!document.body.textContent.includes('早上好。'));
  document.querySelector('[data-v2-play]').click();assert.equal(plays[0].m.english,'Good morning.');
  await click('[data-v2-reveal="en"]');assert.ok(document.body.textContent.includes('Good '));await click('[data-v2-definition="w"]');assert.match(document.querySelector('#v2-definition').textContent,/morning · 早上/);
  await click('[data-v2-reveal="zh"]');assert.ok(document.body.textContent.includes('早上好。'));
  await click('[data-v2-answer="no"]');assert.equal(writes[0].body.mode,'listening');assert.equal(writes[0].body.succeeded,false);assert.equal(document.querySelector('[data-v2-answer="yes"]').disabled,true);
  view.open('expression','p');await view.mount();assert.ok(document.body.textContent.includes('早上好。'));assert.ok(!document.body.textContent.includes('Good morning.'));
  const beforeSlow=plays.length;document.querySelector('[data-v2-slow]').click();assert.equal(plays.length,beforeSlow+1);assert.equal(plays.at(-1).o.slow,true);document.querySelector('[data-v2-slow]').click();assert.equal(plays.at(-1).o.slow,true);document.querySelector('[data-v2-repeat]').click();assert.equal(plays.at(-1).o.slow,true);assert.equal(plays.at(-1).o.repeat,true);document.querySelector('[data-v2-shadow]').click();assert.equal(plays.at(-1).o.shadow,true);document.querySelector('[data-v2-play]').click();assert.equal(plays.at(-1).o.slow,false);
  await click('[data-v2-answer="yes"]');assert.equal(writes[1].body.mode,'expression');assert.equal(writes[1].body.target_id,'p');
  await click('[data-v2-mode="pattern"]');assert.ok(document.body.textContent.includes('晚上好。'));assert.ok(!document.body.textContent.includes('Good evening.'));
  await click('[data-v2-reveal="en"]');assert.ok(document.body.textContent.includes('Good evening.'));
  await click('[data-v2-answer="yes"]');assert.equal(writes[2].body.mode,'pattern');assert.equal(writes[2].body.target_id,'v');
  await click('[data-v2-mode="analytics"]');assert.match(document.body.textContent,/真实学习记录/);assert.match(document.body.textContent,/已学习: 2/);assert.match(document.body.textContent,/不是AI分数/);
  await click('[data-v2-mode="review"]');await click('[data-v2-exercise="p"]');assert.ok(!document.body.textContent.includes('Good morning.'));
  await click('[data-v2-item="w"]');await click('[data-v2-item="p"]');await click('[data-v2-dialogue="d"]');assert.equal(dialogue,'d');
  assert.ok(writes.every(w=>w.path==='/learning-v2/results'));assert.equal(new Set(writes.map(w=>w.body.request_id)).size,3);
  view.open('expression','p');await view.mount();await click('[data-v2-reveal="en"]');view.leave();await view.mount();assert.ok(!document.querySelector('.v2-exercise').textContent.includes('Good morning.'));
  view.leave();assert.ok(stopped>0);
 }finally{globalThis.document=old;}
});

test('V2 speech UI requests recognition only on click and never posts transcripts',async()=>{
 const {document}=parseHTML('<html><body><div id="learning-v2-root"></div></body></html>');
 const old={document:globalThis.document,SpeechRecognition:globalThis.SpeechRecognition,isSecureContext:globalThis.isSecureContext};let recognition,created=0,posts=0,aborts=0;
 class Recognition{constructor(){created++;recognition=this;}start(){}abort(){aborts++;}}
 Object.assign(globalThis,{document,SpeechRecognition:Recognition,isSecureContext:true});
 const item={id:'p',kind:'phrase',english:'I want water.',chinese:'我想要水。'};
 const view=createLearningV2({request:async(path,method)=>{if(method==='POST')posts++;return {source:item,materials:[],dialogues:[]};},getUser:()=>({id:'u'}),getCatalog:()=>({materials:[item]}),getLanguage:()=> 'zh',playback:{play(){},stop(){}},signIn(){},openDialogue(){}});
 try{
  view.open('expression','p');await view.mount();assert.equal(created,0);assert.match(document.body.textContent,/浏览器可能将语音发送/);assert.match(document.body.textContent,/不是专业发音评分/);
  document.querySelector('[data-v2-mic]').click();assert.equal(created,1);recognition.onresult({results:[[{transcript:'I want coffee'}]]});assert.match(document.body.textContent,/I want coffee/);assert.match(document.body.textContent,/water → coffee/);assert.equal(posts,0);
  document.querySelector('[data-v2-mic]').click();view.pause();assert.ok(!document.body.textContent.includes('正在听，请说英语'));document.querySelector('[data-v2-mic]').click();const current=recognition;current.onerror({error:'not-allowed'});current.onend();assert.match(document.body.textContent,/权限被拒绝/);
  view.leave();assert.ok(aborts>=1);
 }finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
