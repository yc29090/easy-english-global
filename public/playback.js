import {ENGLISH_SPEECH_RATES,isUsEnglish,voiceSourceRank,voiceLabel} from './speech-policy.js';
export const PLAYBACK_RATES=ENGLISH_SPEECH_RATES;
/** Classic retains its direct-click lifecycle; it does not instantiate the modern engine. */
export function createPlayback(env=globalThis){
 let generation=0,speech=null,active=null,disposed=false,unlisten=()=>{},synth;
 try{synth=env.speechSynthesis;}catch{}
 const timers=new Map(),normalDurations=new Map();
 const now=()=>env.performance?.now?.()??Date.now();
 const valid=s=>!disposed&&active===s&&s.generation===generation;
 function clear(kind){if(timers.has(kind))env.clearTimeout(timers.get(kind));timers.delete(kind);}
 function later(kind,delay,s,fn){if(!valid(s))return;clear(kind);timers.set(kind,env.setTimeout(()=>{timers.delete(kind);if(valid(s))fn();},delay));}
 function voices(){try{synth=env.speechSynthesis;return Array.from(synth?.getVoices?.()||[]).filter(isUsEnglish).sort((a,b)=>voiceSourceRank(a)-voiceSourceRank(b));}catch{return null;}}
 function phase(s,name,state={}){if(valid(s))try{s.options.onPhase?.(name,state);}catch{}}
 function stop(){generation++;active=null;for(const kind of [...timers.keys()])clear(kind);const old=speech;speech=null;if(old)try{synth?.cancel();}catch{}}
 function failed(s,code,message){if(!valid(s))return;stop();try{s.options.onError?.({code,message,status:'error'});}catch{}}
 function once(s){
  if(!valid(s))return false;const available=voices();
  if(available===null){failed(s,'voice-list-error','浏览器无法读取语音列表，播放未开始。');return false;}
  const voice=available[0];
  if(!voice){
   if(!s.waiting){s.waiting=true;phase(s,'loading',{message:'正在等待美式英语语音，尚未开始播放。'});later('load',6000,s,()=>failed(s,'no-us-voice','未找到可用的 en-US 美式英语语音，未播放其他口音或默认声音。'));}
   if(!timers.has('poll'))later('poll',200,s,()=>once(s));return false;
  }
  s.waiting=false;clear('load');clear('poll');let u;
  try{u=new env.SpeechSynthesisUtterance(s.item.english);}catch{failed(s,'utterance-error','浏览器无法创建英语语音请求，播放未开始。');return false;}
  // Preserve ready-voice speak() inside the original user click, without a timer handoff.
  speech=u;u.voice=voice;u.lang='en-US';u.rate=s.options.slow?PLAYBACK_RATES.slow:PLAYBACK_RATES.normal;u.pitch=1;u.volume=1;
  let started=false,startedAt=0;const current=()=>valid(s)&&speech===u;
  u.onstart=()=>{if(!current()||started)return;started=true;startedAt=now();clear('start');phase(s,'listen',{lang:'en-US',rate:u.rate,message:`${s.options.slow?'正在慢速播放（请求语速0.55）':'正在正常播放'} · ${voiceLabel(voice)}。音质和实际语速仍需真机核实。`});later('finish',Math.min(120000,Math.max(15000,s.item.english.split(/\s+/).length*1300/u.rate+5000)),s,()=>failed(s,'end-timeout','设备没有正常结束语音请求，已停止重复。'));};
  u.onend=()=>{
   if(!current())return;clear('start');clear('finish');speech=null;
   if(!started){failed(s,'unconfirmed-start','浏览器未确认开始，不能确认已出声；未继续重复。');return;}
   const key=(voice.voiceURI||voice.name)+'\n'+s.item.english,duration=now()-startedAt,normal=normalDurations.get(key);
   if(!s.options.slow&&duration>=400){normalDurations.set(key,duration);if(normalDurations.size>50)normalDurations.delete(normalDurations.keys().next().value);}
   if(s.options.slow&&normal>=400&&duration>0&&duration<normal*1.15){failed(s,'rate-unconfirmed','设备可能忽略慢速请求，不能确认已变慢；已停止重复。');return;}
   phase(s,s.options.shadow?'speak':s.options.repeat?'pause':'done');
   if(s.options.repeat){const gap=s.options.shadow?Math.max(3000,s.item.english.split(/\s+/).length*850):1500;later('repeat',gap,s,()=>once(s));}else if(valid(s))active=null;
  };
  u.onerror=e=>{if(!current())return;const code=e?.error||'synthesis-failed';failed(s,code,code==='network'?'浏览器语音服务连接失败，未完成播放。':'浏览器英语语音播放失败，未确认成功。');};
  phase(s,'loading',{message:'已请求美式语音，等待设备确认开始。'});later('start',8000,s,()=>failed(s,'start-timeout','设备未确认开始，不能确认已出声。'));
  if(!current())return false;
  try{if(synth.paused)synth.resume?.();synth.speak(u);return true;}catch{failed(s,'synthesis-failed','英语语音合成失败，播放未完成。');return false;}
 }
 function loaded(){if(active?.waiting)once(active);}
 try{if(typeof synth?.addEventListener==='function'){synth.addEventListener('voiceschanged',loaded);unlisten=()=>synth.removeEventListener?.('voiceschanged',loaded);}else if(synth){const previous=synth.onvoiceschanged,handler=e=>{try{previous?.call(synth,e);}catch{}loaded();};synth.onvoiceschanged=handler;unlisten=()=>{if(synth.onvoiceschanged===handler)synth.onvoiceschanged=previous;};}}catch{}
 voices(); // Same silent eager discovery as production classic.
 function play(item,options={}){
  stop();if(disposed||typeof item?.english!=='string'||!item.english.trim())return false;
  const s={generation,item,options,waiting:false};active=s;voices();
  if(!synth||!env.SpeechSynthesisUtterance){failed(s,'unsupported','当前浏览器不支持英语语音播放，尚未开始。');return false;}
  // Unreviewed URL-only media still cannot bypass the explicit en-US policy.
  return once(s);
 }
 function dispose(){stop();disposed=true;normalDurations.clear();try{unlisten();}catch{}}
 return {play,stop,dispose};
}
