/** Only an on-device en-US voice is eligible. No microphone, provider API or audio uploads. */
export function createOgdenSpeech(env=globalThis){
 let generation=0,timer=null,voice=null;
 const voices=()=>{const all=env.speechSynthesis?.getVoices?.()||[];if(!voice||!all.includes(voice))voice=all.find(v=>/^en[-_]US$/i.test(v.lang)&&v.localService===true)||null;return voice;};
 function stop(){generation++;if(timer!==null)env.clearTimeout(timer);timer=null;env.speechSynthesis?.cancel();}
 function play(text,{slow=false,repeat=false,notify=()=>{}}={}){
  stop();const selected=voices(),active=generation;
  if(!selected||!env.SpeechSynthesisUtterance){notify('此浏览器没有可用的本地美式英语语音，请阅读参考表达并自行朗读。未切换到其他口音或远程语音。');return false;}
  const once=()=>{if(active!==generation)return;const utterance=new env.SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.voice=selected;utterance.rate=slow?0.65:1;
   utterance.onend=()=>{if(active!==generation)return;if(repeat)timer=env.setTimeout(once,1800);else notify('播放结束。');};
   utterance.onerror=()=>{if(active===generation){stop();notify('本地语音播放失败，请自行朗读。');}};
   notify((slow?'浏览器低速合成请求（设备可能忽略语速），不是专门录制的慢速音频。':'本地美式语音：')+(!slow?selected.name:''));
   env.speechSynthesis.speak(utterance);
  };once();return true;
 }
 return {play,stop};
}
