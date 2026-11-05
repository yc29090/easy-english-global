import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOgdenSpeech,OGDEN_SPEECH_RATES} from '../public/ogden/speech.js';
const US={lang:'en-US',name:'US local',voiceURI:'us-local',localService:true};
const GB={lang:'en-GB',name:'UK local',voiceURI:'gb-local',localService:true};
const ZH={lang:'zh-CN',name:'Chinese',voiceURI:'zh',localService:true};
function fixture(initial=[ZH,GB,US]){
 let voices=initial,time=0,next=0,cancels=0,resumes=0,fetches=0;const timers=new Map(),listeners=new Map(),spoken=[];
 const env={performance:{now:()=>time},fetch:()=>{fetches++;throw Error('No site TTS fetch permitted');},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
  speechSynthesis:{speaking:false,pending:false,paused:false,getVoices:()=>voices,cancel(){cancels++;this.speaking=false;this.pending=false;},resume(){resumes++;this.paused=false;},speak(u){spoken.push(u);this.pending=true;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
  setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms,due:time+ms});return next;},clearTimeout:id=>timers.delete(id)};
 function advance(ms){const until=time+ms;let count=0;while(true){const found=[...timers].filter(([,t])=>t.due<=until).sort((a,b)=>a[1].due-b[1].due)[0];if(!found)break;if(++count>1000)throw Error('Unbounded timer loop');time=found[1].due;timers.delete(found[0]);found[1].fn();}time=until;}
 return {env,timers,listeners,spoken,advance,cancels:()=>cancels,resumes:()=>resumes,fetches:()=>fetches,setVoices:v=>{voices=v;},load:v=>{voices=v;listeners.get('voiceschanged')?.();env.speechSynthesis.onvoiceschanged?.();},start:(u=spoken.at(-1))=>{env.speechSynthesis.pending=false;env.speechSynthesis.speaking=true;u.onstart?.();},end:(u=spoken.at(-1))=>{env.speechSynthesis.speaking=false;env.speechSynthesis.pending=false;u.onend?.();}};
}
test('en-US is preferred and explicitly bound; normal and slow set distinct real request rates',()=>{
 const f=fixture(),speech=createOgdenSpeech(f.env);let message='';speech.play('Get help.',{notify:s=>message=s});const first=f.spoken[0];assert.equal(first.voice,US);assert.equal(first.lang,'en-US');assert.equal(first.rate,1);assert.match(message,/等待设备确认/);assert.ok(!message.includes('正在正常播放'));
 f.start();assert.match(message,/正在正常播放/);speech.play('Get help.',{slow:true,notify:s=>message=s});assert.equal(f.spoken.length,1);f.advance(120);assert.equal(f.spoken.at(-1).voice,US);assert.equal(f.spoken.at(-1).rate,OGDEN_SPEECH_RATES.slow);assert.equal(OGDEN_SPEECH_RATES.slow,.55);f.start();assert.match(message,/正在慢速播放/);speech.stop();assert.equal(f.timers.size,0);
});
test('other English locales and Android missing localService are eligible; non-English default is never used',()=>{
 const ca={lang:'en_CA',name:'Canadian',voiceURI:'ca'},f=fixture([ZH,ca,GB]),s=createOgdenSpeech(f.env);let message='';s.play('Hello',{notify:m=>message=m});assert.equal(f.spoken[0].voice,GB);f.start();assert.match(message,/en-GB/);assert.match(message,/其他英语口音/);s.stop();f.setVoices([ZH,ca]);f.advance(120);s.play('Hello');assert.equal(f.spoken.at(-1).voice,ca);assert.equal(f.spoken.at(-1).lang,'en-CA');
});
test('browser online US English is eligible without adding a paid API or site network request',()=>{
 const remote={lang:'en-US',name:'Browser US',voiceURI:'remote-us',localService:false},f=fixture([ZH,GB,remote]),s=createOgdenSpeech(f.env);let message='';s.play('Static curriculum only',{notify:m=>message=m});assert.equal(f.spoken[0].voice,remote);assert.match(message,/浏览器在线英语语音/);assert.equal(f.fetches(),0);s.stop();
});
test('an empty initial list resumes the user-requested playback after voiceschanged, exactly once',()=>{
 const f=fixture([]),s=createOgdenSpeech(f.env);let message='';assert.equal(f.spoken.length,0);s.play('Hi',{slow:true,notify:m=>message=m});assert.match(message,/正在加载/);assert.equal(f.spoken.length,0);f.load([US]);assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].rate,.55);f.load([US]);assert.equal(f.spoken.length,1);f.start();assert.equal([...f.timers.values()].some(t=>t.ms===200||t.ms===6000),false);s.dispose();assert.equal(f.listeners.size,0);
});
test('bounded polling handles Android devices that omit voiceschanged',()=>{
 const f=fixture([]),s=createOgdenSpeech(f.env);s.play('Hi');f.setVoices([GB]);f.advance(200);assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].voice,GB);s.stop();
});
test('empty list timeout and a genuinely non-English-only list are accurately distinguished',()=>{
 for(const voices of [[],[ZH]]){const f=fixture(voices),s=createOgdenSpeech(f.env);let message='';s.play('Hello',{notify:m=>message=m});f.advance(6000);assert.equal(f.spoken.length,0);assert.match(message,voices.length?/没有可用的英语语音/:/列表仍为空/);assert.equal(f.timers.size,0);f.load([US]);assert.equal(f.spoken.length,0);}
});
test('stop or leaving before delayed voices load prevents automatic late playback',()=>{
 const f=fixture([]),s=createOgdenSpeech(f.env);let message='';s.play('Hi',{notify:m=>message=m});s.stop();const stoppedMessage=message;f.load([US]);f.advance(10000);assert.equal(f.spoken.length,0);assert.equal(message,stoppedMessage);assert.equal(f.timers.size,0);s.dispose();assert.equal(s.play('Hi'),false);
});
test('rapid normal/slow/stop clicks settle cancellation and only the newest request can speak',()=>{
 const f=fixture([US]),s=createOgdenSpeech(f.env);s.play('One',{repeat:true});f.start();const old=f.spoken[0];s.play('Two');f.advance(50);s.play('Three',{slow:true});old.onend();old.onerror({error:'interrupted'});assert.equal(f.spoken.length,1);f.advance(70);assert.equal(f.spoken.length,2);assert.equal(f.spoken[1].text,'Three');assert.equal(f.spoken[1].rate,.55);s.stop();f.advance(20000);assert.equal(f.spoken.length,2);assert.equal(f.timers.size,0);
});
test('repeat waits for a confirmed end, keeps slow rate, ignores duplicate callbacks and stops cleanly',()=>{
 const f=fixture([US]),s=createOgdenSpeech(f.env);s.play('Get help',{slow:true,repeat:true});f.start();f.advance(1000);assert.equal(f.spoken.length,1);const u=f.spoken[0];f.end();u.onend();u.onerror({error:'synthesis-failed'});assert.equal(f.timers.size,1);f.advance(1799);assert.equal(f.spoken.length,1);f.advance(1);assert.equal(f.spoken.length,2);assert.equal(f.spoken[1].rate,.55);s.stop();f.advance(10000);assert.equal(f.spoken.length,2);assert.equal(f.timers.size,0);
});
test('paused synthesis resumes and completed speech is not cancelled before the next word',()=>{
 const f=fixture([US]),s=createOgdenSpeech(f.env);f.env.speechSynthesis.paused=true;s.play('Hello');assert.equal(f.resumes(),1);f.start();f.end();s.play('Thanks');assert.equal(f.cancels(),0);assert.equal(f.spoken.length,2);s.stop();assert.equal(f.cancels(),1);
});
test('synthesis failure tries another explicit English voice and never claims success before onstart',()=>{
 const f=fixture(),s=createOgdenSpeech(f.env);let message='';s.play('Help',{notify:m=>message=m});const u=f.spoken[0];u.onerror({error:'synthesis-failed'});assert.match(message,/正在尝试另一/);assert.ok(!message.includes('正在正常播放'));f.advance(120);assert.equal(f.spoken.at(-1).voice,GB);f.start();assert.match(message,/正在正常播放/);assert.match(message,/en-GB/);assert.ok(f.spoken.every(u=>/^en[-_]/.test(u.lang)));s.stop();
});
test('not-allowed, network, thrown speak and missing start produce explicit bounded failures',()=>{
 for(const code of ['not-allowed','network','throw','timeout']){const f=fixture([US]),s=createOgdenSpeech(f.env);let message='';if(code==='throw')f.env.speechSynthesis.speak=()=>{throw Error('device secret must not leak');};s.play('Help',{notify:m=>message=m});if(code==='timeout')f.advance(8000);else if(code!=='throw')f.spoken[0].onerror({error:code});assert.equal(f.timers.size,0);assert.match(message,/未允许|连接失败|合成失败|未确认开始/);assert.ok(!message.includes('正在正常播放'));assert.ok(!message.includes('secret'));s.stop();}
});
test('end without start and missing completion never silently loop repeats',()=>{
 const f=fixture([US]),s=createOgdenSpeech(f.env);let message='';s.play('Help',{repeat:true,notify:m=>message=m});f.end();assert.match(message,/无法确认是否出声/);assert.equal(f.timers.size,0);s.play('Help',{repeat:true,notify:m=>message=m});f.start();f.advance(15000);assert.match(message,/没有正常结束/);assert.equal(f.timers.size,0);
});
test('removed voices can fall back to another English voice on repetition, never to Chinese',()=>{
 const f=fixture(),s=createOgdenSpeech(f.env);s.play('Hi',{repeat:true});f.start();f.end();f.setVoices([ZH,GB]);f.advance(1800);assert.equal(f.spoken.at(-1).voice,GB);s.stop();
});
test('paired real-event durations warn and stop repetition when a device appears to ignore slow rate',()=>{
 const f=fixture([US]),s=createOgdenSpeech(f.env);let message='';s.play('Same sentence');f.start();f.advance(1000);f.end();s.play('Same sentence',{slow:true,repeat:true,notify:m=>message=m});f.start();f.advance(1000);f.end();assert.match(message,/不能确认已变慢/);assert.equal(f.timers.size,0);
});
test('real slower event duration is accepted and not confused with unchanged duration',()=>{
 const f=fixture([US]),s=createOgdenSpeech(f.env);let message='';s.play('Same sentence');f.start();f.advance(1000);f.end();s.play('Same sentence',{slow:true,notify:m=>message=m});f.start();f.advance(1800);f.end();assert.match(message,/播放结束/);assert.ok(!message.includes('不能确认'));assert.equal(f.timers.size,0);
});
test('broken discovery, constructors, event hooks and unsupported browsers never crash the page',()=>{
 const f=fixture();f.env.speechSynthesis.getVoices=()=>{throw Error('device secret');};let message='';assert.equal(createOgdenSpeech(f.env).play('Hi',{notify:m=>message=m}),false);assert.match(message,/无法读取/);
 const g=fixture();g.env.SpeechSynthesisUtterance=class{constructor(){throw Error('device');}};assert.equal(createOgdenSpeech(g.env).play('Hi',{notify:m=>message=m}),false);assert.match(message,/无法创建/);
 assert.equal(createOgdenSpeech({setTimeout,clearTimeout}).play('Hi',{notify:m=>message=m}),false);assert.match(message,/不支持/);
 const h=fixture([]);delete h.env.speechSynthesis.addEventListener;let original=0;const handler=()=>{original++;};h.env.speechSynthesis.onvoiceschanged=handler;const speech=createOgdenSpeech(h.env);speech.play('Hi');h.load([US]);assert.equal(original,1);assert.equal(h.spoken.length,1);speech.dispose();assert.equal(h.env.speechSynthesis.onvoiceschanged,handler);
});
