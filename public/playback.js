import {createEnglishSpeech,ENGLISH_SPEECH_RATES} from './english-speech.js';
export const PLAYBACK_RATES=ENGLISH_SPEECH_RATES;
export function createPlayback(env=globalThis){
 const speech=createEnglishSpeech(env);let generation=0;
 function stop(){generation++;speech.stop();}
 function play(item,options={}){
  const active=++generation;
  // URL-only media has no verified accent provenance. Do not bypass the en-US policy.
  const gap=options.shadow?Math.max(3000,String(item.english).split(/\s+/).length*850):1500;
  return speech.play(item.english,{slow:options.slow===true,repeat:options.repeat===true,repeatGap:gap,onState:state=>{
   if(active!==generation)return;
   if(state.status==='playing')options.onPhase?.('listen',state);
   else if(['loading','pending','retrying'].includes(state.status))options.onPhase?.('loading',state);
   else if(state.status==='ended')options.onPhase?.(options.shadow?'speak':options.repeat?'pause':'done',state);
   else if(state.status==='error')options.onError?.(state);
  }});
 }
 function dispose(){stop();speech.dispose();}
 return {play,stop,dispose};
}
