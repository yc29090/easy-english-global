// Browser speech recognition only; no MediaRecorder, audio upload or persistence.
export function createExpressionInput(host=globalThis){
 let active=null;
 const reset=entry=>{host.clearTimeout(entry.timer);entry.button.setAttribute('aria-pressed','false');entry.button.textContent='🎤 点击说话';};
 function cancel(){if(!active)return;const entry=active;active=null;reset(entry);entry.output.textContent='语音输入已停止，可以继续打字。';try{entry.recognition.abort();}catch{}}
 function toggle(input,button,output){
  if(active?.input===input){const entry=active;output.textContent='正在完成识别…';try{entry.recognition.stop();}catch{cancel();}return;}
  cancel();
  const Recognition=host.SpeechRecognition||host.webkitSpeechRecognition;
  if(!Recognition){output.textContent='此浏览器不支持英语语音识别，请继续打字。';return;}
  let recognition;try{recognition=new Recognition();}catch{output.textContent='语音识别不可用，请继续打字。';return;}
  const entry={recognition,input,button,output,timer:null,received:false,failed:false};active=entry;
  recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
  const current=()=>active===entry&&input.isConnected!==false;
  const arm=milliseconds=>{host.clearTimeout(entry.timer);entry.timer=host.setTimeout(()=>{if(!current())return;cancel();output.textContent='语音识别等待超时，请重试或继续打字。';},milliseconds);};
  const fail=code=>{if(!current())return;entry.failed=true;active=null;reset(entry);output.textContent=['not-allowed','service-not-allowed'].includes(code)?'麦克风权限或语音服务被拒绝，请允许后重试，也可继续打字。':code==='audio-capture'?'没有可用麦克风，请继续打字。':code==='no-speech'?'未识别到英语，请重试或继续打字。':'语音识别不可用或网络失败，请重试或继续打字。';try{recognition.abort();}catch{}};
  recognition.onstart=()=>{if(!current())return;output.textContent='正在聆听英语，请说话…';arm(30000);};
  recognition.onresult=event=>{
   if(!current())return;
   const transcript=Array.from(event.results||[]).filter(result=>result.isFinal!==false).map(result=>result[0]?.transcript||'').join(' ').trim();
   if(!transcript)return;entry.received=true;input.value=transcript;input.dispatchEvent(new host.Event('input',{bubbles:true}));output.textContent='识别完成，可以修改文字后继续练习。';
  };
  recognition.onerror=event=>fail(event.error);
  recognition.onend=()=>{if(active!==entry)return;active=null;reset(entry);if(!entry.received&&!entry.failed)output.textContent='未识别到英语，请重试或继续打字。';};
  button.setAttribute('aria-pressed','true');button.textContent='停止说话';output.textContent='正在请求麦克风权限并启动识别…';arm(10000);
  try{recognition.start();}catch(error){fail(error?.name==='NotAllowedError'?'not-allowed':'unavailable');}
 }
 return {toggle,cancel};
}
