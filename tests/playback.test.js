import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback} from '../public/playback.js';
function fake(){
 const jobs=new Map(),spoken=[],audios=[];let next=0,cancels=0;
 class Utterance{constructor(text){this.text=text;}}
 class Audio{constructor(url){this.url=url;audios.push(this);}play(){return Promise.resolve();}pause(){this.paused=true;}}
 const env={SpeechSynthesisUtterance:Utterance,Audio,speechSynthesis:{speak:s=>spoken.push(s),cancel:()=>cancels++},setTimeout:(fn,delay)=>{jobs.set(++next,{fn,delay});return next;},clearTimeout:id=>jobs.delete(id)};
 return {env,jobs,spoken,audios,cancels:()=>cancels};
}
test('slow speech repeats only after completion and a speaking pause; stop cancels pending work',()=>{
 const f=fake(),p=createPlayback(f.env),phases=[];
 p.play({english:'Can you help me?'},{slow:true,repeat:true,shadow:true,onPhase:p=>phases.push(p)});
 assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].rate,.65);assert.equal(f.spoken[0].lang,'en-US');assert.equal(f.jobs.size,0);
 f.spoken[0].onend();assert.deepEqual(phases,['listen','speak']);assert.ok([...f.jobs.values()][0].delay>=3000);
 p.stop();assert.equal(f.jobs.size,0);f.spoken[0].onend();assert.equal(f.jobs.size,0);assert.ok(f.cancels()>0);
});
test('starting another source cancels the old repeat and original HTTPS audio takes precedence',()=>{
 const f=fake(),p=createPlayback(f.env);p.play({english:'First'},{repeat:true});f.spoken[0].onend();assert.equal(f.jobs.size,1);
 p.play({english:'Second',audio_slow:'https://example.com/slow.mp3'},{slow:true});assert.equal(f.jobs.size,0);assert.equal(f.audios[0].url,'https://example.com/slow.mp3');assert.equal(f.spoken.length,1);
 p.stop();assert.equal(f.audios[0].paused,true);
});
test('unavailable speech reports failure without a repeat loop',()=>{
 let errors=0;const f=fake();delete f.env.speechSynthesis;createPlayback(f.env).play({english:'Hello'},{repeat:true,onError:()=>errors++});assert.equal(errors,1);assert.equal(f.jobs.size,0);
});
