import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback as baselineClassic} from './fixtures/speech/production-classic.js';
import {createOgdenSpeech as baselineModern} from './fixtures/speech/production-modern.js';
import {createPlayback} from '../public/playback.js';
import {createOgdenSpeech} from '../public/ogden/speech.js';
import {fixture} from './speech-fixture.js';
// Exact repository main 6c5afeb snapshots, not claims about a real phone's selected voice.
for(const source of [false,undefined])test(`same-device differential: online/unknown US (${source}) passes classic, old modern rejects, fixed modern accepts`,()=>{
 const voice={lang:'en-US',name:'Same-device US',voiceURI:'us',...(source===undefined?{}:{localService:source})};
 const old=fixture([voice]),broken=fixture([voice]),fixed=fixture([voice]),classic=fixture([voice]);
 const oldPlayer=baselineClassic(old.env),brokenPlayer=baselineModern(broken.env),fixedPlayer=createOgdenSpeech(fixed.env),classicPlayer=createPlayback(classic.env);let message='';
 oldPlayer.play({english:'Can I have water?'});assert.equal(old.spoken.length,1);assert.equal(old.spoken[0].voice,voice);
 brokenPlayer.play('Can I have water?',{notify:m=>message=m});assert.equal(broken.spoken.length,0);assert.match(message,/没有可用的本地美式/);
 fixedPlayer.play('Can I have water?');classicPlayer.play({english:'Can I have water?'});assert.equal(fixed.spoken.length,1);assert.equal(classic.spoken.length,1);assert.equal(fixed.spoken[0].voice,voice);assert.equal(classic.spoken[0].voice,voice);
 assert.equal(old.cancels(),0);assert.equal(broken.cancels(),1);assert.equal(fixed.cancels(),0);assert.equal(classic.cancels(),0);
 oldPlayer.stop();brokenPlayer.dispose();fixedPlayer.dispose();classicPlayer.dispose();
});
test('working classic alone does not prove en-US availability: baseline can use another accent but both fixed versions refuse it',()=>{
 const voice={lang:'en-GB',name:'UK',localService:true},old=fixture([voice]);baselineClassic(old.env).play({english:'Hello'});assert.equal(old.spoken[0].lang,'en-GB');
 for(const kind of ['classic','modern']){const f=fixture([voice]),p=kind==='classic'?createPlayback(f.env):createOgdenSpeech(f.env);p.play(kind==='classic'?{english:'Hello'}:'Hello');f.advance(6000);assert.equal(f.spoken.length,0);p.stop();}
});
test('ready local/online/unknown US stays synchronous in the click for classic and modern, no idle cancel or deferred first speak',()=>{
 for(const source of [true,false,undefined])for(const kind of ['classic','modern']){const f=fixture([{lang:'en-US',name:'US',localService:source}]);let gesture=true;const original=f.env.speechSynthesis.speak;f.env.speechSynthesis.speak=u=>{assert.equal(gesture,true,'Initial speak must remain in the click');original.call(f.env.speechSynthesis,u);};
  const p=kind==='classic'?createPlayback(f.env):createOgdenSpeech(f.env);assert.equal(f.spoken.length,0);assert.equal(f.cancels(),0);p.play(kind==='classic'?{english:'Hello'}:'Hello');gesture=false;assert.equal(f.spoken.length,1);assert.equal(f.cancels(),0);assert.equal(f.spoken[0].lang,'en-US');p.stop();}
});
test('classic and modern each handle late US without voiceschanged, but stop cancels all future playback',()=>{
 for(const kind of ['classic','modern']){const f=fixture([]),p=kind==='classic'?createPlayback(f.env):createOgdenSpeech(f.env);p.play(kind==='classic'?{english:'Hello'}:'Hello');f.setVoices([{lang:'en-US',name:'Online US',localService:false}]);f.advance(200);assert.equal(f.spoken.length,1);p.stop();const count=f.spoken.length;f.load([{lang:'en-US',localService:false}]);f.advance(20000);assert.equal(f.spoken.length,count);assert.equal(f.timers.size,0);}
});
