import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayback,PLAYBACK_RATES} from '../public/playback.js';
function fake(){
 const jobs=new Map(),spoken=[],audios=[];let next=0,cancels=0;
 class Utterance{constructor(text){this.text=text;}}
 class Audio{constructor(url){this.url=url;this.preservesPitch=false;audios.push(this);}play(){return Promise.resolve();}pause(){this.paused=true;}}
 const env={SpeechSynthesisUtterance:Utterance,Audio,speechSynthesis:{speak:s=>spoken.push(s),cancel:()=>cancels++},setTimeout:(fn,delay)=>{jobs.set(++next,{fn,delay});return next;},clearTimeout:id=>jobs.delete(id)};
 return {env,jobs,spoken,audios,cancels:()=>cancels};
}
test('slow speech repeats only after completion and a speaking pause; stop cancels pending work',()=>{
 const f=fake(),p=createPlayback(f.env),phases=[];
 p.play({english:'Can you help me?'},{slow:true,repeat:true,shadow:true,onPhase:p=>phases.push(p)});
 assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].rate,PLAYBACK_RATES.slow);assert.equal(f.spoken[0].lang,'en-US');assert.equal(f.jobs.size,0);
 f.spoken[0].onend();assert.deepEqual(phases,['listen','speak']);assert.ok([...f.jobs.values()][0].delay>=3000);
 p.stop();assert.equal(f.jobs.size,0);f.spoken[0].onend();assert.equal(f.jobs.size,0);assert.equal(f.cancels(),0);
});
test('starting another source cancels the old repeat and original HTTPS audio takes precedence',()=>{
 const f=fake(),p=createPlayback(f.env);p.play({english:'First'},{repeat:true});f.spoken[0].onend();assert.equal(f.jobs.size,1);
 p.play({english:'Second',audio_slow:'https://example.com/slow.mp3'},{slow:true});assert.equal(f.jobs.size,0);assert.equal(f.audios[0].url,'https://example.com/slow.mp3');assert.equal(f.spoken.length,1);
 p.stop();assert.equal(f.audios[0].paused,true);
});
test('unavailable speech reports failure without a repeat loop',()=>{
 let errors=0;const f=fake();delete f.env.speechSynthesis;createPlayback(f.env).play({english:'Hello'},{repeat:true,onError:()=>errors++});assert.equal(errors,1);assert.equal(f.jobs.size,0);
});
test('normal and slow speech use distinct rates and select an available English voice',()=>{
 const f=fake(),english={name:'English',lang:'en-US',localService:true},chinese={name:'Chinese',lang:'zh-CN',default:true};
 f.env.speechSynthesis.getVoices=()=>[chinese,english];const p=createPlayback(f.env);
 p.play({english:'water'});assert.equal(f.spoken.at(-1).rate,PLAYBACK_RATES.normal);assert.equal(f.spoken.at(-1).voice,english);
 p.play({english:'water'},{slow:true});assert.equal(f.spoken.at(-1).rate,PLAYBACK_RATES.slow);assert.ok(f.spoken.at(-1).rate<f.spoken[0].rate);assert.equal(f.spoken.at(-1).voice,english);
});
test('slow playback falls back to normal media at a real slower playback rate while preserving pitch',()=>{
 const f=fake(),p=createPlayback(f.env);p.play({english:'Water',audio_normal:'https://example.com/normal.mp3'},{slow:true,repeat:true});
 const clip=f.audios[0];assert.equal(clip.url,'https://example.com/normal.mp3');assert.equal(clip.playbackRate,PLAYBACK_RATES.slow);assert.equal(clip.preservesPitch,true);assert.equal(f.spoken.length,0);
 clip.playbackRate=1;clip.onloadedmetadata();assert.equal(clip.playbackRate,PLAYBACK_RATES.slow);
 clip.onended();const job=[...f.jobs.values()][0];f.jobs.clear();job.fn();assert.equal(f.audios.at(-1).playbackRate,PLAYBACK_RATES.slow);
 p.stop();assert.equal(f.audios.at(-1).onloadedmetadata,null);
});
test('shared normal/slow media URLs are slowed once, while distinct slow clips are not slowed twice',()=>{
 const f=fake(),p=createPlayback(f.env),url='https://example.com/audio.mp3';
 p.play({english:'Water',audio_normal:url,audio_slow:url},{slow:true});assert.equal(f.audios.at(-1).playbackRate,PLAYBACK_RATES.slow);
 p.play({english:'Water',audio_normal:url,audio_slow:'https://example.com/slow.mp3'},{slow:true});assert.equal(f.audios.at(-1).playbackRate,1);
 p.play({english:'Water',audio_normal:url});assert.equal(f.audios.at(-1).playbackRate,1);
});
test('paused synthesis resumes for explicit playback and asynchronous English voices are used on the next play',()=>{
 const f=fake();let voices=[],resumed=0,changed;
 f.env.speechSynthesis.getVoices=()=>voices;f.env.speechSynthesis.addEventListener=(_event,fn)=>{changed=fn;};f.env.speechSynthesis.paused=true;f.env.speechSynthesis.resume=()=>{resumed++;};
 const p=createPlayback(f.env);assert.equal(f.spoken.length,0);voices=[{name:'English',lang:'en-GB',localService:true}];changed();
 p.play({english:'Can I have water?'},{slow:true});assert.equal(resumed,1);assert.equal(f.spoken[0].voice,voices[0]);assert.equal(f.spoken[0].rate,PLAYBACK_RATES.slow);
});
test('a finished utterance is not cancelled before the next slow word and completion is handled once',()=>{
 const f=fake(),p=createPlayback(f.env);p.play({english:'water'},{repeat:true});const first=f.spoken[0];first.onend();first.onend();assert.equal(f.jobs.size,1);
 p.play({english:'water'},{slow:true});assert.equal(f.cancels(),0);assert.equal(f.jobs.size,0);assert.equal(f.spoken.at(-1).rate,PLAYBACK_RATES.slow);
 p.stop();assert.equal(f.cancels(),1);
});
