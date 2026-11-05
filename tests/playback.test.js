import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback,PLAYBACK_RATES} from '../public/playback.js';
import {fixture} from './speech-fixture.js';
const US={lang:'en-US',name:'US fixture',localService:true};
test('classic words, phrases, scene lines and dialogue turns share explicit US normal/slow requests',()=>{
 const f=fixture([US]),p=createPlayback(f.env);
 for(const english of ['water','Can I have water?','Welcome to our hotel.','Yes, please.']){
  p.play({english});assert.equal(f.spoken.at(-1).text,english);assert.equal(f.spoken.at(-1).lang,'en-US');assert.equal(f.spoken.at(-1).voice,US);assert.equal(f.spoken.at(-1).rate,1);f.start();f.end();
  p.play({english},{slow:true});assert.equal(f.spoken.at(-1).rate,.55);f.start();f.end();
 }p.dispose();assert.deepEqual(PLAYBACK_RATES,{normal:1,slow:.55});
});
test('classic waiting is not reported as listening or completed before onstart',()=>{
 const f=fixture([]),p=createPlayback(f.env),phases=[];p.play({english:'Hello'},{onPhase:p=>phases.push(p)});assert.deepEqual(phases,['loading']);f.load([US]);assert.deepEqual(phases,['loading','loading']);f.start();assert.equal(phases.at(-1),'listen');f.end();assert.equal(phases.at(-1),'done');p.dispose();
});
test('classic repeat and shadow pauses retain slow rate and stop prevents stale callbacks',()=>{
 const f=fixture([US]),p=createPlayback(f.env),phases=[];p.play({english:'Can you help me?'},{slow:true,repeat:true,shadow:true,onPhase:x=>phases.push(x)});f.start();f.end();assert.equal(phases.at(-1),'speak');f.advance(3400);assert.equal(f.spoken.length,2);assert.equal(f.spoken[1].rate,.55);p.stop();const count=phases.length;f.spoken[1].onstart();f.spoken[1].onend();f.advance(100000);assert.equal(phases.length,count);assert.equal(f.spoken.length,2);assert.equal(f.timers.size,0);
});
test('rapid classic mode changes cancel old audio without overlap',()=>{
 const f=fixture([US]),p=createPlayback(f.env);p.play({english:'One'},{repeat:true});f.start();p.play({english:'Two'},{slow:true});p.play({english:'Three'});f.advance(120);assert.equal(f.spoken.length,3);assert.equal(f.spoken[2].text,'Three');assert.equal(f.spoken[2].rate,1);assert.ok(f.cancels()>=1);p.stop();
});
test('URL-only audio cannot bypass US policy; no unreviewed clip or default speech is played',()=>{
 const f=fixture([{lang:'en-GB',name:'British'}]),p=createPlayback(f.env);let errors=[];let audio=0;f.env.Audio=class{constructor(){audio++;}};
 p.play({english:'Water',audio_normal:'https://example.invalid/unreviewed.mp3',audio_slow:'https://example.invalid/slow.mp3'},{slow:true,onError:s=>errors.push(s)});f.advance(6000);assert.equal(f.spoken.length,0);assert.equal(audio,0);assert.equal(errors[0].code,'no-us-voice');assert.match(errors[0].message,/en-US/);
});
test('classic accepts browser online US voice and missing source metadata',()=>{
 for(const metadata of [{localService:false},{}]){const us={lang:'en-US',name:'US',...metadata},f=fixture([us]),p=createPlayback(f.env);p.play({english:'Hello'});assert.equal(f.spoken[0].voice,us);p.stop();}
});
test('classic playback errors and unsupported engines retain precise structured failure',()=>{
 const f=fixture([US]),p=createPlayback(f.env);let error;p.play({english:'Hello'},{onError:s=>error=s});f.spoken[0].onerror({error:'network'});assert.equal(error.code,'network');assert.match(error.message,/连接失败/);assert.equal(f.timers.size,0);
 delete f.env.speechSynthesis;createPlayback(f.env).play({english:'Hello'},{onError:s=>error=s});assert.equal(error.code,'unsupported');
});
test('classic paired unchanged rate timings expose failure rather than success',()=>{
 const f=fixture([US]),p=createPlayback(f.env);let error;p.play({english:'Same sentence'});f.start();f.advance(1000);f.end();p.play({english:'Same sentence'},{slow:true,repeat:true,onError:s=>error=s});f.start();f.advance(1000);f.end();assert.equal(error.code,'rate-unconfirmed');assert.equal(f.timers.size,0);
});
