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
  document.querySelector('[data-v2-slow]').click();document.querySelector('[data-v2-repeat]').click();assert.equal(plays.at(-1).o.slow,true);assert.equal(plays.at(-1).o.repeat,true);
  await click('[data-v2-answer="yes"]');assert.equal(writes[1].body.mode,'expression');assert.equal(writes[1].body.target_id,'p');
  await click('[data-v2-mode="pattern"]');assert.ok(document.body.textContent.includes('晚上好。'));assert.ok(!document.body.textContent.includes('Good evening.'));
  await click('[data-v2-reveal="en"]');assert.ok(document.body.textContent.includes('Good evening.'));
  await click('[data-v2-answer="yes"]');assert.equal(writes[2].body.mode,'pattern');assert.equal(writes[2].body.target_id,'v');
  await click('[data-v2-mode="review"]');await click('[data-v2-exercise="p"]');assert.ok(!document.body.textContent.includes('Good morning.'));
  await click('[data-v2-item="w"]');await click('[data-v2-item="p"]');await click('[data-v2-dialogue="d"]');assert.equal(dialogue,'d');
  assert.ok(writes.every(w=>w.path==='/learning-v2/results'));assert.equal(new Set(writes.map(w=>w.body.request_id)).size,3);
  view.leave();assert.ok(stopped>0);
 }finally{globalThis.document=old;}
});
