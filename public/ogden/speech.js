import {createPlayback,PLAYBACK_RATES} from '../playback.js';
export const OGDEN_SPEECH_RATES=PLAYBACK_RATES;
/** Only translate the 2.0 interface. Voice discovery, selection, fallback and timing belong to 1.0. */
export function createOgdenSpeech(env=globalThis){
 const playback=createPlayback(env);let generation=0,disposed=false;
 function stop(){generation++;playback.stop();}
 function play(text,{slow=false,repeat=false,notify=()=>{}}={}){
  if(disposed||typeof text!=='string'||!text.trim())return false;
  const active=++generation;let failed=false;
  const tell=message=>{if(active===generation)try{notify(message);}catch{}};
  playback.play({english:text},{slow,repeat,onPhase:phase=>{
   if(phase==='listen')tell(`已请求${slow?'慢速播放（0.55）':'正常播放（1.0）'}；使用1.0播放模式，实际发声和语速由设备决定。`);
   else if(phase==='pause')tell('本次播放请求结束，稍后按所选语速重复。');
   else tell('播放请求结束；实际听感请自行核实。');
  },onError:()=>{failed=true;tell('1.0语音播放模式暂不可用，请重试；未接入额外TTS服务。');}});
  return !failed;
 }
 function dispose(){stop();disposed=true;}
 return {play,stop,dispose};
}
