import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {createEnglishSpeech} from '../public/english-speech.js';
import {fixture} from './speech-fixture.js';
test('all native curriculum synthesis is owned by the shared US engine',async()=>{
 const files=await readdir(new URL('../public/',import.meta.url),{recursive:true});const owners=[];
 for(const file of files.filter(f=>f.endsWith('.js'))){const source=await readFile(new URL('../public/'+file,import.meta.url),'utf8');if(/new\s+env\.SpeechSynthesisUtterance|\bsynth\.speak\(/.test(source))owners.push(file);}
 assert.deepEqual(owners,['english-speech.js']);
 for(const [path,symbol] of [['playback.js','createEnglishSpeech'],['ogden/speech.js','createOgdenSpeech']])assert.ok((await readFile(new URL('../public/'+path,import.meta.url),'utf8')).includes(symbol));
});
test('US-only retries are bounded to three voices, never other accents, with sanitized failures',()=>{
 const voices=Array.from({length:5},(_,i)=>({lang:'en-US',name:'US '+i,voiceURI:'us'+i}));const f=fixture([{lang:'en-GB'},...voices]),s=createEnglishSpeech(f.env);let state;
 s.play('Hello',{repeat:true,onState:x=>state=x});for(let i=0;i<3;i++){f.spoken.at(-1).onerror({error:'synthesis-failed'});f.advance(120);}assert.equal(f.spoken.length,3);assert.equal(state.status,'error');assert.equal(f.timers.size,0);assert.ok(f.spoken.every(u=>u.lang==='en-US'));
});
test('stopping synchronously in a pending callback cannot queue a stale utterance',()=>{
 const f=fixture([{lang:'en-US'}]),s=createEnglishSpeech(f.env);s.play('Hello',{onState:x=>{if(x.status==='pending')s.stop();}});assert.equal(f.spoken.length,0);assert.equal(f.timers.size,0);
});
