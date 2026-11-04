/** Dictionary phonemes do not control synthesis. Only a local en-US voice is eligible. */
export function createOgdenSpeech(env=globalThis){
 let generation=0,timer=null,watchdog=null,voice=null,current=null,waiting=null,disposed=false;
 const synth=env.speechSynthesis;
 const voices=()=>{const all=synth?.getVoices?.()||[];voice=all.find(v=>/^en[-_]US$/i.test(v.lang)&&v.localService===true)||null;return voice;};
 function stop(){generation++;if(timer!==null)env.clearTimeout(timer);if(watchdog!==null)env.clearTimeout(watchdog);timer=watchdog=null;waiting=null;current=null;try{synth?.cancel();}catch{/* A broken device voice must not break learning. */}}
 function loaded(){voices();if(waiting&&voice){const notify=waiting;waiting=null;if(timer!==null)env.clearTimeout(timer);timer=null;notify('本地美式语音已准备好，请再次点击播放。声音不会自动开始。');}}
 synth?.addEventListener?.('voiceschanged',loaded);
 voices(); // Ask for the list before the first user click; Safari may populate it later.
 function play(text,{slow=false,repeat=false,notify=()=>{}}={}){
  stop();if(disposed||typeof text!=='string'||!text.trim())return false;
  const selected=voices(),active=generation;
  if(!selected||!env.SpeechSynthesisUtterance){
   if(synth&&env.SpeechSynthesisUtterance&&!(synth.getVoices?.()||[]).length){
    waiting=notify;notify('本地语音列表正在加载。准备好后请再次点击播放；不会切换远程服务。');
    timer=env.setTimeout(()=>{if(active!==generation)return;timer=null;waiting=null;notify('未找到可用的本地美式英语语音。请检查设备语音设置，或阅读参考表达并自行朗读。');},4000);
   }else notify('此浏览器没有可用的本地美式英语语音，请阅读参考表达并自行朗读。未切换到其他口音或远程语音。');
   return false;
  }
  const once=()=>{
   if(active!==generation)return;
   const utterance=new env.SpeechSynthesisUtterance(text);current=utterance; // Retain until end: some mobile engines lose unreferenced utterances.
   utterance.lang='en-US';utterance.voice=selected;utterance.rate=slow?0.65:1;
   const clearStart=()=>{if(watchdog!==null)env.clearTimeout(watchdog);watchdog=null;};
   utterance.onstart=()=>{if(active===generation)clearStart();};
   utterance.onend=()=>{if(active!==generation)return;clearStart();current=null;if(repeat)timer=env.setTimeout(once,1800);else notify('播放结束。');};
   utterance.onerror=()=>{if(active===generation){stop();notify('本地语音播放失败，请再次点击或自行朗读。未切换远程服务。');}};
   notify(slow?'浏览器低速合成请求（设备可能忽略语速），不是专门录制的慢速音频。':'本地美式语音：'+selected.name);
   watchdog=env.setTimeout(()=>{if(active===generation){stop();notify('设备未确认开始朗读，请再次点击播放。若仍无声音，请检查音量及本地美式语音设置；真机行为待验收。');}},8000);
   try{if(synth.paused)synth.resume?.();synth.speak(utterance);}catch{stop();notify('本地语音无法启动，请自行朗读。未切换远程服务。');}
  };once();return true;
 }
 function dispose(){stop();disposed=true;synth?.removeEventListener?.('voiceschanged',loaded);}
 return {play,stop,dispose};
}
