import {test} from 'node:test';import assert from 'node:assert/strict';
import {releaseSmoke} from '../src/ogden-release-smoke.ts';import {OPERATORS} from '../src/ogden-content.ts';
function fixture(open:boolean,denied=false,owner='fixture-user'){
 const calls:{path:string;method:string}[]=[];
 const fetcher=(async(input:any,init:RequestInit={})=>{
  const path=new URL(String(input)).pathname;calls.push({path,method:init.method||'GET'});
  if(path==='/health')return Response.json({ok:true});
  if(path==='/')return new Response('Easy English',{headers:{'content-security-policy':"default-src 'self'",'x-content-type-options':'nosniff'}});
  if(path==='/api/catalog')return Response.json({features:{manualPayment:true,mockCheckout:false},counts:[{kind:'word',count:500},{kind:'phrase',count:200}],scenes:Array(20).fill({}),materials:[{is_free:true}],dialogues:[{scene_id:'fixture',is_free:true}]});
  if(path==='/api/admin/users')return new Response('',{status:401});
  if(path==='/ogden')return new Response('',{status:open?200:404});
  if(['/ogden/app.js','/ogden/speech.js','/ogden/requests.js','/ogden/styles.css'].includes(path))return new Response('',{status:open?200:404});
  if(path==='/api/auth/login')return Response.json({user:{id:'fixture-user',hasAccess:!denied,must_change_password:false}},{headers:{'set-cookie':'ee_session=fixture; HttpOnly; SameSite=Lax; Secure'}});
  if(path==='/api/auth/logout')return Response.json({logout:true});
  if(path==='/api/ogden/catalog'){
   if(!open)return new Response('',{status:404});if(!(init.headers as any)?.Cookie)return new Response('',{status:401});if(denied)return new Response('',{status:403});
   return Response.json({preview:false,entitlement:{productionEnabled:true,additionalChargeCny:0},items:[...Array.from({length:850},(_,i)=>({kind:'word',id:'fixture-'+i,reviewStatus:'approved'})),...OPERATORS.map(english=>({kind:'operator',english,reviewStatus:'approved',variants:[{},{},{}]})),...Array.from({length:48},()=>({kind:'pattern',reviewStatus:'approved',variants:[{},{},{}]})),...Array.from({length:109},()=>({kind:'combination',reviewStatus:'approved'})),...Array.from({length:140},()=>({kind:'expression',reviewStatus:'approved',answers:['fixture one','fixture two'],evaluation:'self-assessment'}))]});
  }
  if(path.startsWith('/api/ogden/'))return denied?new Response('',{status:403}):Response.json(path.endsWith('/progress')?{ownerId:owner,progress:[],practice:[]}:{items:[]});
  return new Response('',{status:404});
 }) as typeof fetch;return {fetcher,calls};
}
test('closed release smoke is GET-only, accepts existing manual payments and never probes orders or writes progress',async()=>{
 const f=fixture(false);const r=await releaseSmoke('https://fixture.invalid',{expect:'closed',manualPayment:true},f.fetcher);
 assert.equal(r.authenticatedChecks,'NOT_RUN');assert.equal(r.progressWriteChecks,'NOT_RUN');assert.ok(f.calls.every(c=>c.method==='GET'));assert.ok(f.calls.every(c=>!c.path.includes('orders')&&!c.path.includes('results')));
});
test('open release smoke checks member/expired permissions and owns progress, always logs out without payment writes',async()=>{
 for(const access of ['allowed','denied'] as const){const f=fixture(true,access==='denied');const r=await releaseSmoke('https://fixture.invalid',{expect:'open',manualPayment:true,credentials:{email:'test@example.invalid',password:'fixture-only-password',access}},f.fetcher);assert.equal(r.authenticatedChecks,'PASS');assert.equal(r.progressWriteChecks,'NOT_RUN');assert.deepEqual(f.calls.filter(x=>x.method==='POST').map(x=>x.path),['/api/auth/login','/api/auth/logout']);}
 const f=fixture(true,false,'other-user');await assert.rejects(()=>releaseSmoke('https://fixture.invalid',{expect:'open',credentials:{email:'test@example.invalid',password:'fixture-only-password',access:'allowed'}},f.fetcher),/progress belongs/);assert.equal(f.calls.at(-1)?.path,'/api/auth/logout');
});
test('release smoke rejects unsafe origins, unexpected payment state, malformed data and provider secret errors',async()=>{
 for(const url of ['http://remote.invalid','https://user:secret@fixture.invalid','https://fixture.invalid/path','https://fixture.invalid/?secret=1'])await assert.rejects(()=>releaseSmoke(url,{expect:'closed'},fixture(false).fetcher),/HTTPS/);
 await assert.rejects(()=>releaseSmoke('https://fixture.invalid',{expect:'closed',manualPayment:false},fixture(false).fetcher),/manual-payment flag/);
 await assert.rejects(()=>releaseSmoke('https://fixture.invalid',{expect:'closed'},(async()=>new Response('<html>private fixture</html>')) as typeof fetch),/data unavailable|database readiness/);
 await assert.rejects(()=>releaseSmoke('https://fixture.invalid',{expect:'closed'},(async()=>{throw Error('provider-secret-do-not-leak');}) as typeof fetch),e=>e instanceof Error&&!e.message.includes('provider-secret'));
});
