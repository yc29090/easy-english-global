export function fixture(initial=[]){
 let voices=initial,time=0,next=0,cancels=0,resumes=0,fetches=0;const timers=new Map(),listeners=new Map(),spoken=[];
 const env={performance:{now:()=>time},fetch:()=>{fetches++;throw Error('No site TTS fetch permitted');},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
  speechSynthesis:{speaking:false,pending:false,paused:false,getVoices:()=>voices,cancel(){cancels++;this.speaking=false;this.pending=false;},resume(){resumes++;this.paused=false;},speak(u){spoken.push(u);this.pending=true;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
  setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms,due:time+ms});return next;},clearTimeout:id=>timers.delete(id)};
 function advance(ms){const until=time+ms;let count=0;while(true){const found=[...timers].filter(([,t])=>t.due<=until).sort((a,b)=>a[1].due-b[1].due)[0];if(!found)break;if(++count>1000)throw Error('Unbounded timer loop');time=found[1].due;timers.delete(found[0]);found[1].fn();}time=until;}
 return {env,timers,listeners,spoken,advance,cancels:()=>cancels,resumes:()=>resumes,fetches:()=>fetches,setVoices:v=>{voices=v;},load:v=>{voices=v;listeners.get('voiceschanged')?.();env.speechSynthesis.onvoiceschanged?.();},start:(u=spoken.at(-1))=>{env.speechSynthesis.pending=false;env.speechSynthesis.speaking=true;u.onstart?.();},end:(u=spoken.at(-1))=>{env.speechSynthesis.speaking=false;env.speechSynthesis.pending=false;u.onend?.();}};
}
