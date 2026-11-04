import {test} from 'node:test';import assert from 'node:assert/strict';import {createOgdenSpeech} from '../public/ogden/speech.js';
test('only local US voice; genuine synthesis rate request, repeats and cancellation',()=>{
 const us={lang:'en-US',name:'Local US',localService:true};let voices=[{lang:'en-GB',localService:true},{lang:'en-US',localService:false},us],utterance,timer,cancel=0,notice='';
 const env={speechSynthesis:{getVoices:()=>voices,speak:u=>utterance=u,cancel:()=>cancel++},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>timer=null};
 const speech=createOgdenSpeech(env);assert.equal(speech.play('Get help.',{notify:x=>notice=x}),true);assert.equal(utterance.voice,us);assert.equal(utterance.rate,1);
 speech.play('Get help.',{slow:true,repeat:true,notify:x=>notice=x});assert.equal(utterance.rate,.65);assert.match(notice,/不是专门录制/);utterance.onend();assert.ok(timer);speech.stop();assert.equal(timer,null);assert.ok(cancel>=3);
 voices=[];assert.equal(speech.play('Test',{notify:x=>notice=x}),false);assert.match(notice,/没有可用的本地美式/);
});
