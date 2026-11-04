import {test} from 'node:test';import assert from 'node:assert/strict';import {createOgdenSpeech} from '../public/ogden/speech.js';
function fixture(){const timers=new Map(),listeners=new Map(),spoken=[];let next=0,cancel=0,resume=0;const us={lang:'en-US',name:'Local US',localService:true};let voices=[{lang:'en-GB',localService:true},{lang:'en-US',localService:false},us];const env={speechSynthesis:{getVoices:()=>voices,speak:u=>spoken.push(u),cancel:()=>cancel++,resume:()=>resume++,addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id)};return {env,us,timers,listeners,spoken,setVoices:v=>voices=v,cancel:()=>cancel,resume:()=>resume};}
test('only local US voice; genuine synthesis rate, retained repeat and cancellation',()=>{
 const f=fixture();let notice='';const s=createOgdenSpeech(f.env);assert.equal(s.play('Get help.',{notify:x=>notice=x}),true);let u=f.spoken.at(-1);assert.equal(u.voice,f.us);assert.equal(u.rate,1);u.onstart();assert.equal(f.timers.size,0);
 s.play('Get help.',{slow:true,repeat:true,notify:x=>notice=x});u=f.spoken.at(-1);assert.equal(u.rate,.65);assert.match(notice,/不是专门录制/);u.onstart();u.onend();assert.equal(f.timers.size,1);const repeat=[...f.timers.values()][0];assert.equal(repeat.ms,1800);s.stop();assert.equal(f.timers.size,0);repeat.fn();assert.equal(f.spoken.length,2);assert.ok(f.cancel()>=3);
 f.setVoices([{lang:'en-US',localService:false}]);assert.equal(s.play('Test',{notify:x=>notice=x}),false);assert.match(notice,/没有可用的本地美式/);
});
test('asynchronous voices require a fresh gesture, timeout is explicit and stop cancels pending notification',()=>{
 const f=fixture();f.setVoices([]);const s=createOgdenSpeech(f.env);let notice='';s.play('Hi',{notify:x=>notice=x});assert.match(notice,/正在加载/);f.setVoices([f.us]);f.listeners.get('voiceschanged')();assert.match(notice,/再次点击/);assert.equal(f.spoken.length,0);assert.equal(f.timers.size,0);
 s.play('Hi');assert.equal(f.spoken.length,1);s.stop();f.setVoices([]);s.play('Hi',{notify:x=>notice=x});const timeout=[...f.timers.values()][0];timeout.fn();assert.match(notice,/未找到/);
 s.play('Hi',{notify:x=>notice=x});s.stop();const before=notice;f.setVoices([f.us]);f.listeners.get('voiceschanged')();assert.equal(notice,before);s.dispose();assert.equal(f.listeners.size,0);assert.equal(s.play('Hi'),false);
});
test('rapid clicks ignore old callbacks; paused engine, thrown errors and missing start do not silently succeed',()=>{
 const f=fixture();const s=createOgdenSpeech(f.env);let notice='';s.play('One',{repeat:true});const old=f.spoken.at(-1);s.play('Two',{notify:x=>notice=x});old.onend();old.onerror();assert.equal(f.timers.size,1);f.spoken.at(-1).onstart();assert.equal(f.timers.size,0);
 f.env.speechSynthesis.paused=true;s.play('Three');assert.equal(f.resume(),1);[...f.timers.values()][0].fn();assert.equal(f.timers.size,0);
 s.play('Four',{notify:x=>notice=x});[...f.timers.values()][0].fn();assert.match(notice,/未确认开始/);
 f.env.speechSynthesis.speak=()=>{throw Error('device');};s.play('Five',{notify:x=>notice=x});assert.match(notice,/无法启动/);assert.equal(f.timers.size,0);
});
