const expansions={"i'm":'i am',"you're":'you are',"we're":'we are',"they're":'they are',"it's":'it is',"don't":'do not',"doesn't":'does not',"can't":'can not',cannot:'can not',"i've":'i have'};
export function speechTokens(value){return (String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").match(/[a-z]+(?:'[a-z]+)*/g)||[]).flatMap(w=>(expansions[w]||w).split(' ')).slice(0,100);}
/** Word alignment, not pronunciation grading or an inferred proficiency score. */
export function compareSpeech(reference,recognized){
 const a=speechTokens(reference),b=speechTokens(recognized),cost=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)cost[i][0]=i;for(let j=0;j<=b.length;j++)cost[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)cost[i][j]=Math.min(cost[i-1][j]+1,cost[i][j-1]+1,cost[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 let i=a.length,j=b.length;const operations=[];
 while(i||j){
  if(i&&j&&cost[i][j]===cost[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){operations.push({kind:a[i-1]===b[j-1]?'match':'different',expected:a[--i],actual:b[--j]});}
  else if(i&&cost[i][j]===cost[i-1][j]+1)operations.push({kind:'missing',expected:a[--i]});
  else operations.push({kind:'extra',actual:b[--j]});
 }
 return operations.reverse();
}
export function createSpeechPractice(env=globalThis){
 const Constructor=env.SpeechRecognition||env.webkitSpeechRecognition;let recognition=null,generation=0;
 const supported=typeof Constructor==='function'&&env.isSecureContext!==false;
 function stop(){generation++;const current=recognition;recognition=null;if(current){current.onresult=null;current.onerror=null;current.onend=null;try{current.abort();}catch{}}}
 function start(reference,onState){
  stop();if(!supported){onState({status:'unsupported'});return;}
  const active=generation;let current;
  try{current=new Constructor();recognition=current;current.lang='en-US';current.continuous=false;current.interimResults=false;current.maxAlternatives=1;
   current.onresult=event=>{if(active!==generation)return;const transcript=String(event.results?.[0]?.[0]?.transcript||'').slice(0,2000);onState({status:'result',transcript,operations:compareSpeech(reference,transcript)});};
   current.onerror=event=>{if(active!==generation)return;const known=['not-allowed','service-not-allowed','audio-capture','no-speech','network','language-not-supported','aborted'];onState({status:'error',code:known.includes(event.error)?event.error:'unavailable'});};
   current.onend=()=>{if(active===generation){recognition=null;generation++;onState({status:'ended'});}};
   current.start();onState({status:'listening'});
  }catch{stop();onState({status:'error',code:'unavailable'});}
 }
 return {supported,start,stop};
}
