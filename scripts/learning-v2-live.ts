// Real HTTPS acceptance on dedicated QA users only. No owner password or DB URL.
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const site='https://easy-english-global.onrender.com',run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT||'1';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.V2_LIVE_ACCEPTANCE!=='enabled'||!run||!/^\d+$/.test(run)||!/^\d+$/.test(attempt))throw new Error('Run only from the explicitly enabled live-acceptance workflow');
let phase='initialization',passed=0;
const accounts:Array<{email:string;password:string;cookie?:string;id?:string}>=[];
const check=(ok:unknown,label:string)=>{phase=label;if(!ok)throw new Error('Acceptance check failed');passed++;console.log('PASS '+label);};
async function request(path:string,method='GET',body?:unknown,cookie?:string){return fetch(site+path,{method,redirect:'error',signal:AbortSignal.timeout(60000),headers:{Origin:site,...body?{'Content-Type':'application/json'}:{},...cookie?{Cookie:cookie}:{}},...body?{body:JSON.stringify(body)}:{}});}
async function account(suffix:string){
 phase='dedicated QA registration';const a={email:`ee-v2-${run}-${attempt}-${suffix}@example.invalid`,password:randomBytes(32).toString('base64url'),cookie:undefined as string|undefined,id:undefined as string|undefined};accounts.push(a);
 const response=await request('/api/auth/register','POST',{email:a.email,password:a.password});check(response.status===200,'Dedicated QA '+suffix+' registration');
 a.cookie=response.headers.get('set-cookie')?.split(';')[0];const user=(await response.json()).user;a.id=user.id;check(user.role==='user'&&user.membership==='free','Dedicated QA '+suffix+' stays free');
 check((await request('/api/auth/logout','POST',{},a.cookie)).ok,'QA '+suffix+' initial logout');a.cookie=undefined;
 phase='dedicated QA login';const login=await request('/api/auth/login','POST',{email:a.email,password:a.password});check(login.status===200,'Dedicated QA '+suffix+' actual login');a.cookie=login.headers.get('set-cookie')?.split(';')[0];
 check(!!a.cookie&&/HttpOnly/i.test(login.headers.get('set-cookie')||'')&&/; Secure/i.test(login.headers.get('set-cookie')||''),'QA '+suffix+' secure session');return a;
}
try{
 for(const file of ['app.js','learning-v2.js','speech-practice.js','styles.css']){
  phase='deployed asset '+file;const r=await request('/'+file);check(r.ok,'Deployed asset '+file+' available');
  const actual=createHash('sha256').update(await r.text()).digest('hex'),expected=createHash('sha256').update(await readFile(new URL('../public/'+file,import.meta.url))).digest('hex');
  check(actual===expected,'Deployed asset '+file+' matches release source');
 }
 phase='production feature gates';const catalog=await (await request('/api/catalog')).json();check(catalog.features?.mockCheckout===false&&catalog.features?.manualPayment===false,'Production mock and manual payment stay disabled');
 check((await request('/api/learning-v2/patterns')).status===401,'Anonymous V2 request denied');
 const a=await account('a');
 phase='V2 free lesson links';const phrase=catalog.materials.find((m:any)=>m.kind==='phrase');check(!!phrase,'Accessible phrase available');
 const linksResponse=await request('/api/learning-v2/links?material_id='+encodeURIComponent(phrase.id),'GET',undefined,a.cookie);check(linksResponse.status===200,'Live association endpoint available');
 const links=await linksResponse.json();check(links.source.id===phrase.id&&links.materials.length>0&&links.materials.every((m:any)=>m.is_free),'Associations preserve free-content access');check(links.dialogues.length>0&&links.dialogues.every((d:any)=>d.is_free),'Accessible related scene conversations');
 const patternsResponse=await request('/api/learning-v2/patterns','GET',undefined,a.cookie);check(patternsResponse.status===200,'Live pattern endpoint available');const patterns=(await patternsResponse.json()).variants;check(patterns.length===4&&patterns.every((v:any)=>v.is_free),'Four free curated pattern variants');
 const before=await (await request('/api/progress','GET',undefined,a.cookie)).json();
 const result={request_id:randomUUID(),mode:'listening',target_id:phrase.id,succeeded:false};
 check((await request('/api/learning-v2/results','POST',result,a.cookie)).status===200,'Listening result saved on live site');
 const repeated=await request('/api/learning-v2/results','POST',result,a.cookie);check(repeated.ok&&(await repeated.json()).duplicate===true,'Live repeated result remains idempotent');
 check((await request('/api/learning-v2/results','POST',{...result,request_id:randomUUID(),mode:'expression',succeeded:true},a.cookie)).status===200,'Expression result saved independently');
 check((await request('/api/learning-v2/results','POST',{request_id:randomUUID(),mode:'pattern',target_id:patterns[0].id,succeeded:true},a.cookie)).status===200,'Pattern result saved independently');
 const after=await (await request('/api/progress','GET',undefined,a.cookie)).json();check(JSON.stringify(before.progress)===JSON.stringify(after.progress),'QA ordinary learning state is unchanged');
 const review=await (await request('/api/learning-v2/review?all=true','GET',undefined,a.cookie)).json();check(review.exercises.length===3&&review.exercises[0].mode==='listening','Live review prioritizes failed listening');
 const analysis=await (await request('/api/learning-v2/analytics','GET',undefined,a.cookie)).json();check(analysis.ordinary.length===0&&analysis.practice.length===3&&analysis.practice.every((r:any)=>r.attempts===1),'Live analytics reflect actual isolated practice');
 check((await request('/api/admin/users','GET',undefined,a.cookie)).status===403,'Free user cannot access administration');
 check((await request('/api/learning-v2/links?material_id=ee-v1-food-word-01','GET',undefined,a.cookie)).status===403,'Free user cannot access paid V2 content');
 const b=await account('b');
 const other=await (await request('/api/learning-v2/review?all=true','GET',undefined,b.cookie)).json();check(other.exercises.length===0,'Second QA user cannot see first user records');
 const otherAnalysis=await (await request('/api/learning-v2/analytics','GET',undefined,b.cookie)).json();check(otherAnalysis.ordinary.length===0&&otherAnalysis.practice.length===0,'Second user analytics are isolated');
 console.log('LIVE_V2_ACCEPTANCE_COMPLETE '+passed+' checks passed; disable dedicated QA accounts for run '+run);
}catch{console.error('Live V2 acceptance failed at safe step: '+phase);process.exitCode=1;}
finally{
 for(const a of accounts){if(a.cookie)try{await request('/api/auth/logout','POST',{},a.cookie);}catch{}a.password='';a.cookie=undefined;}
}
