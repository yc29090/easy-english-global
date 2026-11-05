import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createPlayback,PLAYBACK_RATES} from '../public/playback.js';
import {createOgdenSpeech,OGDEN_SPEECH_RATES} from '../public/ogden/speech.js';
function fixture(voices=[]){
 let time=0,id=0,cancels=0;const jobs=new Map(),spoken=[],listeners=new Map();
 const env={SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{paused:false,getVoices:()=>voices,speak(u){spoken.push(u);},cancel(){cancels++;},addEventListener:(n,f)=>listeners.set(n,f)},setTimeout:(fn,ms)=>{jobs.set(++id,{fn,at:time+ms});return id;},clearTimeout:n=>jobs.delete(n)};
 return {env,spoken,jobs,cancels:()=>cancels,load(v){voices=v;listeners.get('voiceschanged')?.();},advance(ms){time+=ms;for(const [n,t] of [...jobs])if(t.at<=time){jobs.delete(n);t.fn();}}};
}
test('both versions delegate all native synthesis to production classic implementation',async()=>{
 const source=await readFile(new URL('../public/ogden/speech.js',import.meta.url),'utf8');assert.match(source,/createPlayback.*from '..\/playback.js'/);assert.ok(!source.includes('getVoices'));assert.ok(!source.includes('localService'));assert.equal(OGDEN_SPEECH_RATES,PLAYBACK_RATES);
 const owners=[];for(const p of (await readdir(new URL('../public/',import.meta.url),{recursive:true})).filter(p=>p.endsWith('.js'))){const s=await readFile(new URL('../public/'+p,import.meta.url),'utf8');if(/new\s+env\.SpeechSynthesisUtterance/.test(s))owners.push(p);}assert.deepEqual(owners,['playback.js']);
});
for(const voices of [[{lang:'en-US',name:'local',localService:true}],[{lang:'en-US',name:'online',localService:false}],[{lang:'en-US',name:'unknown'}],[{lang:'en-GB',name:'UK',localService:true}],[{lang:'zh-CN',default:true}],[]])test('classic/modern identical immediate voice and fallback: '+JSON.stringify(voices),()=>{
 const a=fixture(voices),b=fixture(voices),classic=createPlayback(a.env),modern=createOgdenSpeech(b.env);classic.play({english:'I want water.'},{slow:true});modern.play('I want water.',{slow:true});assert.equal(a.spoken.length,1);assert.equal(b.spoken.length,1);for(const key of ['text','lang','voice','rate','pitch','volume'])assert.deepEqual(a.spoken[0][key],b.spoken[0][key],key);assert.equal(b.spoken[0].rate,.55);classic.stop();modern.dispose();
});
test('normal, slow, repeat and stop retain classic rates and cancel all pending repetition',()=>{
 const f=fixture([{lang:'en-GB',name:'UK',localService:true}]),p=createOgdenSpeech(f.env);p.play('Hello');assert.equal(f.spoken[0].rate,1);p.play('Hello',{slow:true,repeat:true});assert.equal(f.spoken[1].rate,.55);f.spoken[1].onend();f.advance(1500);assert.equal(f.spoken[2].rate,.55);assert.equal(f.spoken[2].voice.lang,'en-GB');p.stop();const count=f.spoken.length;f.spoken[2].onend();f.advance(20000);assert.equal(f.spoken.length,count);assert.equal(f.jobs.size,0);
});
test('rapid switching keeps immediate classic calls and ignores canceled old callbacks',()=>{
 const f=fixture(),p=createOgdenSpeech(f.env);p.play('One',{repeat:true});const old=f.spoken[0];p.play('Two',{slow:true});old.onend();old.onerror();p.play('Three');assert.deepEqual(f.spoken.map(x=>x.text),['One','Two','Three']);assert.equal(f.spoken.at(-1).rate,1);assert.ok(f.cancels()>=2);p.stop();f.advance(20000);assert.equal(f.spoken.length,3);
});
test('late voice list refreshes exactly as classic: next explicit click uses the loaded voice',()=>{
 const f=fixture(),p=createOgdenSpeech(f.env);p.play('First');assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].voice,undefined);const us={lang:'en-US',name:'loaded',localService:false};f.load([us]);assert.equal(f.spoken.length,1);p.play('Next');assert.equal(f.spoken.at(-1).voice,us);p.dispose();assert.equal(p.play('Disposed'),false);
});
test('unsupported and failed playback give failure messages without retries or paid service',()=>{
 const f=fixture(),p=createOgdenSpeech(f.env);let message='';p.play('Hello',{repeat:true,notify:m=>message=m});f.spoken[0].onerror();assert.match(message,/暂不可用/);assert.equal(f.jobs.size,0);const g=fixture();delete g.env.speechSynthesis;assert.equal(createOgdenSpeech(g.env).play('Hello',{notify:m=>message=m}),false);assert.match(message,/暂不可用/);
});
