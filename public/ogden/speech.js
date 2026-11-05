/** Native Web Speech only. Bind an explicit en-US voice only; never fall back to a different accent. */
export const OGDEN_SPEECH_RATES=Object.freeze({normal:1,slow:0.55});
export function createOgdenSpeech(env=globalThis){
 let synth,active=null,current=null,preferred=null,generation=0,disposed=false,cancelUntil=0,unlisten=()=>{};
 try{synth=env.speechSynthesis;}catch{/* Report unavailable on an explicit click. */}
 const timers=new Map(),normalDurations=new Map();
 const locale=v=>String(v?.lang||'').trim().replace(/_/g,'-').toLowerCase();
 const american=v=>locale(v)==='en-us';
 const identity=v=>v?.voiceURI||`${locale(v)}|${v?.name||''}|${String(v?.localService)}`;
 const same=(a,b)=>!!a&&!!b&&(a===b||identity(a)===identity(b));
 const rank=v=>v.localService===true?0:v.localService===false?2:1;
 const now=()=>{try{return env.performance?.now?.()??Date.now();}catch{return Date.now();}};
 const tell=(fn,message)=>{try{fn(message);}catch{/* A detached view must not crash the engine. */}};
 const valid=s=>!disposed&&active===s&&s.generation===generation;
 function clear(kind){if(timers.has(kind))env.clearTimeout(timers.get(kind));timers.delete(kind);}
 function later(kind,delay,s,fn){clear(kind);timers.set(kind,env.setTimeout(()=>{timers.delete(kind);if(valid(s))fn();},delay));}
 function scan(){
  try{if(typeof synth?.getVoices!=='function')return {all:[],error:true};const raw=synth.getVoices()||[],length=Math.min(500,Math.max(0,Number(raw.length)||0));return {all:Array.from({length},(_,i)=>raw[i]).filter(Boolean),error:false};}
  catch{return {all:[],error:true};}
 }
 function stop(){
  let hadSpeech=!!current;try{hadSpeech=hadSpeech||synth?.speaking===true||synth?.pending===true;}catch{}
  generation++;active=null;current=null;for(const kind of [...timers.keys()])clear(kind);
  if(hadSpeech){cancelUntil=now()+120;try{synth?.cancel();}catch{}}
  return hadSpeech||now()<cancelUntil;
 }
 function halt(s,message){if(!valid(s))return;const notify=s.notify;stop();tell(notify,message);}
 function voiceLabel(v){const source=v.localService===true?'本地英语语音':v.localService===false?'浏览器在线英语语音':'浏览器英语语音（来源由浏览器决定）';return `${source}：${v.name||v.lang} · ${v.lang}`;}
 function select(s,all){
  const candidates=all.filter(v=>american(v)&&!s.failed.has(identity(v))).sort((a,b)=>rank(a)-rank(b));
  const retained=candidates.find(v=>same(v,s.selected));if(retained)return retained;
  return candidates.find(v=>same(v,preferred)&&rank(v)===rank(candidates[0]))||candidates[0]||null;
 }
 function failed(s,u,code){
  if(!valid(s)||current!==u)return;
  clear('start');clear('finish');current=null;s.failed.add(identity(u.voice));s.failedLocale=locale(u.voice);s.selected=null;
  cancelUntil=now()+120;try{synth.cancel();}catch{}
  const messages={
   'not-allowed':'浏览器未允许启动英语语音。语音可能已就绪，请再次点击播放；尚未确认出声。',
   interrupted:'英语语音被系统中断，已停止。可以重新点击播放。',canceled:'英语语音被系统取消，已停止。',
   network:'浏览器语音服务连接失败，未完成播放。可以重试；这不代表麦克风权限有问题。',
   'audio-busy':'设备音频正被占用，未能开始播放。', 'audio-hardware':'设备音频输出不可用，未能完成播放。',
   'start-timeout':'设备未确认开始朗读，不能确认已出声。请再次点击播放。',
   'voice-unavailable':'所选英语语音无法使用，未完成播放。', 'language-unavailable':'所选英语语音的语言服务不可用。',
   'synthesis-unavailable':'浏览器语音合成服务不可用。', 'synthesis-failed':'英语语音合成失败，未完成播放。'
  };
  const message=messages[code]||'浏览器英语语音播放失败，尚未确认成功。';
  const candidates=scan();
  if(!['not-allowed','interrupted','canceled','text-too-long','invalid-argument'].includes(code)&&s.attempts<3&&!candidates.error&&select(s,candidates.all)){
   tell(s.notify,message+' 正在尝试另一可用美式英语语音；不会切换其他口音。');later('handoff',120,s,()=>begin(s));
  }else halt(s,message+' 未自动接入网站付费TTS服务。');
 }
 function speak(s,selected){
  let u;try{u=new env.SpeechSynthesisUtterance(s.text);}catch{halt(s,'浏览器无法创建英语语音请求，播放未开始。');return false;}
  s.attempts++;s.selected=selected;current=u;let started=false,startedAt=0;
  u.voice=selected;u.lang=String(selected.lang).replace(/_/g,'-');u.rate=s.slow?OGDEN_SPEECH_RATES.slow:OGDEN_SPEECH_RATES.normal;u.pitch=1;u.volume=1;
  u.onstart=()=>{
   if(!valid(s)||current!==u||started)return;started=true;startedAt=now();preferred=selected;clear('start');
   tell(s.notify,`${s.slow?'正在慢速播放（请求语速0.55）':'正在正常播放'} · ${voiceLabel(selected)}。浏览器实际语速仍需听感核实。`);
   const maximum=Math.min(120000,Math.max(15000,s.text.split(/\s+/).length*1300/u.rate+5000));
   later('finish',maximum,s,()=>halt(s,'设备没有正常结束语音请求，已停止重复播放。可再次尝试。'));
  };
  u.onend=()=>{
   if(!valid(s)||current!==u)return;
   clear('start');clear('finish');current=null;
   if(!started){halt(s,'语音请求已结束，但浏览器未确认开始事件，无法确认是否出声；未继续重复。');return;}
   const key=identity(selected)+'\n'+s.text,duration=now()-startedAt,normal=normalDurations.get(key);
   if(!s.slow&&duration>=400){normalDurations.set(key,duration);if(normalDurations.size>50)normalDurations.delete(normalDurations.keys().next().value);}
   if(s.slow&&normal>=400&&duration>0&&duration<normal*1.15){halt(s,'语音已结束，但与本页同句正常播放时长接近；设备可能忽略了慢速请求，不能确认已变慢。已停止重复播放。');return;}
   s.attempts=0;
   if(s.repeat){tell(s.notify,'本次播放结束，稍后按所选'+(s.slow?'慢速':'正常语速')+'重复。随时可停止。');later('repeat',1800,s,()=>begin(s));}
   else{active=null;tell(s.notify,'播放结束 · '+voiceLabel(selected));}
  };
  u.onerror=event=>failed(s,u,event?.error||'synthesis-failed');
  tell(s.notify,'正在请求'+(s.slow?'慢速':'正常')+'英语语音，等待设备确认开始 · '+voiceLabel(selected));
  later('start',8000,s,()=>failed(s,u,'start-timeout'));
  try{if(synth.paused)synth.resume?.();synth.speak(u);return true;}catch{failed(s,u,'synthesis-failed');return false;}
 }
 function begin(s){
  if(!valid(s))return false;const result=scan();
  if(result.error){halt(s,'浏览器无法读取英语语音列表，播放未开始。请重试；不会使用其他口音或默认语音。');return false;}
  const selected=select(s,result.all);
  if(selected){s.waiting=false;clear('poll');clear('load');return speak(s,selected);}
  if(s.failed.size){halt(s,'可用美式英语语音均未能完成播放，已停止。没有切换其他口音。');return false;}
  if(!s.waiting){
   s.waiting=true;tell(s.notify,result.all.length?'正在等待美式英语语音加载，尚未开始播放。':'浏览器语音列表正在加载，尚未开始播放；就绪后会接续本次点击。');
   later('load',6000,s,()=>{
    const last=scan();if(!last.error&&select(s,last.all)){begin(s);return;}
    halt(s,last.error?'浏览器无法读取英语语音列表，播放未开始。':last.all.length?'当前语音列表没有可用的美式英语语音，未进行播放，也未切换其他口音。':'等待后语音列表仍为空，无法确认美式英语语音是否可用；播放未开始。请重试。');
   });
  }
  // Android devices do not always emit voiceschanged; poll only while a user request is waiting.
  if(!timers.has('poll'))later('poll',200,s,()=>begin(s));return false;
 }
 function loaded(){if(active?.waiting)begin(active);}
 try{
  if(typeof synth?.addEventListener==='function'){synth.addEventListener('voiceschanged',loaded);unlisten=()=>synth.removeEventListener?.('voiceschanged',loaded);}
  else if(synth){const previous=synth.onvoiceschanged;const handler=event=>{try{previous?.call(synth,event);}catch{}loaded();};synth.onvoiceschanged=handler;unlisten=()=>{if(synth.onvoiceschanged===handler)synth.onvoiceschanged=previous;};}
 }catch{/* Polling still works when event registration is unavailable. */}
 scan(); // Silent discovery before the first click. Never synthesize an unlock phrase.
 function play(text,{slow=false,repeat=false,notify=()=>{}}={}){
  const interrupted=stop();if(disposed||typeof text!=='string'||!text.trim())return false;
  if(!synth||!env.SpeechSynthesisUtterance){tell(notify,'当前浏览器不支持英语语音播放，尚未开始朗读。');return false;}
  const s={generation,text,slow,repeat,notify,failed:new Set(),failedLocale:null,selected:null,attempts:0,waiting:false};active=s;
  // Allow Android's cancellation to settle before replacing an active utterance.
  if(interrupted){tell(notify,'正在停止上一条语音并准备新的英语播放请求。');later('handoff',Math.max(1,cancelUntil-now()),s,()=>begin(s));return true;}
  return begin(s);
 }
 function dispose(){stop();disposed=true;normalDurations.clear();try{unlisten();}catch{}}
 return {play,stop,dispose};
}
