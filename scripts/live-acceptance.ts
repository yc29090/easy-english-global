// Explicit production acceptance: only creates isolated QA accounts; never touches existing users.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {smoke} from '../src/smoke.ts';
const base=process.env.LIVE_BASE_URL;
const run=process.env.GITHUB_RUN_ID;
if(!base||!run)throw new Error('LIVE_BASE_URL and GITHUB_RUN_ID are required');
const origin=new URL(base).origin;
if(!origin.startsWith('https://'))throw new Error('HTTPS is required');
const accounts:Record<string,{email:string;password:string;cookie:string}>={};
const results:string[]=[];
function pass(message:string){results.push(message);console.log('PASS '+message);}
async function api(path:string,method='GET',body?:any,who?:string){
 const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,...body?{'Content-Type':'application/json'}:{},...who&&accounts[who]?.cookie?{Cookie:accounts[who].cookie}:{}},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});
 const data=await response.json();return {response,data};
}
async function until(fn:()=>Promise<boolean>,description:string){for(let i=0;i<90;i++){if(await fn())return;await new Promise(r=>setTimeout(r,4000));}throw new Error(description+' timed out');}
try{
 const checks=await smoke(origin);for(const message of checks)pass(message);
 for(const label of ['a','b']){
  const email=`ee-live-${run}-${label}@example.invalid`,password=randomBytes(24).toString('base64url');
  const register=await api('/auth/register','POST',{email,password});assert.equal(register.response.status,200);
  const cookie=register.response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);accounts[label]={email,password,cookie};
  const login=await api('/auth/login','POST',{email,password});assert.equal(login.response.status,200);
  const loginCookie=login.response.headers.get('set-cookie')?.split(';')[0];assert.ok(loginCookie);
  // Revoke the registration session before replacing it with the tested login session.
  await api('/auth/logout','POST',{},label);accounts[label].cookie=loginCookie;
 }
 pass('Two dedicated QA accounts can register and log in over HTTPS');
 const catalog=(await api('/catalog')).data;const free=catalog.materials[0];assert.ok(free?.is_free);
 assert.equal((await api('/progress','PUT',{material_id:free.id,status:'unmastered'},'a')).response.status,200);
 const progress=(await api('/progress','GET',undefined,'a')).data.progress;assert.equal(progress.length,1);assert.equal(progress[0].status,'unmastered');assert.ok(new Date(progress[0].next_review_at)>new Date());
 assert.equal((await api('/progress','GET',undefined,'b')).data.progress.length,0);
 assert.equal((await api('/review/all','GET',undefined,'a')).data.items.length,1);
 assert.equal((await api('/learning-state','GET',undefined,'a')).data.state.last_material_id,free.id);
 pass('Cloud progress, next review time and resume position persist; account B cannot see account A records');
 assert.equal((await api('/admin/users','GET',undefined,'a')).response.status,403);
 assert.equal((await api('/admin/trials','POST',{email:'must-not-be-created@example.invalid',days:7},'a')).response.status,403);
 assert.equal((await api('/orders','POST',{},'a')).response.status,403);
 assert.equal((await api('/orders/confirm','POST',{id:'not-an-order'},'a')).response.status,403);
 assert.equal((await api('/auth/forgot','POST',{email:accounts.a.email})).response.status,503);
 pass('Non-admin cannot use admin APIs; production checkout and disabled email are rejected');
 console.log('WAITING_FOR_DEDICATED_QA_TRIAL');
 await until(async()=>!!(await api('/me','GET',undefined,'b')).data.user?.hasAccess,'Dedicated QA trial activation');
 const full=(await api('/catalog','GET',undefined,'b')).data;
 assert.equal(full.materials.filter((m:any)=>m.kind==='word').length,500);assert.equal(full.materials.filter((m:any)=>m.kind==='phrase').length,200);assert.equal(full.scenes.length,20);
 const dialogues=full.dialogues.filter((d:any)=>d.scene_id);assert.equal(dialogues.length,100);assert.equal(dialogues.reduce((n:number,d:any)=>n+d.turns.length,0),406);
 const paid=full.materials.find((m:any)=>!m.is_free),dialogue=dialogues.find((d:any)=>!d.is_free);assert.ok(paid&&dialogue);
 assert.equal((await api('/progress','PUT',{material_id:paid.id,status:'review'},'a')).response.status,403);
 assert.equal((await api('/practice-progress','PUT',{dialogue_id:dialogue.id,role:'a',turn_index:2},'a')).response.status,403);
 assert.equal((await api('/progress','PUT',{material_id:paid.id,status:'review'},'b')).response.status,200);
 assert.equal((await api('/practice-progress','PUT',{dialogue_id:dialogue.id,role:'a',turn_index:2},'b')).response.status,200);
 assert.equal((await api('/practice-progress','GET',undefined,'a')).data.practice.length,0);
 pass('Trial account can query all 700 items, 20 scenes, 100 dialogues and 406 turns and save speaking practice');
 console.log('WAITING_FOR_DEDICATED_QA_TRIAL_EXPIRY');
 await until(async()=>!(await api('/me','GET',undefined,'b')).data.user?.hasAccess,'Dedicated QA trial expiry');
 const expired=(await api('/catalog','GET',undefined,'b')).data;assert.ok(expired.materials.every((m:any)=>m.is_free));
 assert.equal((await api('/progress','GET',undefined,'b')).data.progress.length,1);assert.equal((await api('/practice-progress','GET',undefined,'b')).data.practice.length,1);
 assert.equal((await api('/progress','PUT',{material_id:paid.id,status:'mastered'},'b')).response.status,403);assert.equal((await api('/practice-progress','PUT',{dialogue_id:dialogue.id,role:'a',turn_index:3},'b')).response.status,403);
 pass('Expired trial loses paid access while retaining its learning and dialogue records');
 console.log('LIVE_ACCEPTANCE_COMPLETE '+results.length+' checks passed');
}catch{console.error('LIVE_ACCEPTANCE_FAILED: inspect safe PASS markers and dedicated QA database state; credentials are never logged');process.exitCode=1;}
finally{for(const key of Object.keys(accounts))try{await api('/auth/logout','POST',{},key);}catch{}}
