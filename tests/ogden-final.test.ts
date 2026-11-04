import {request as httpRequest} from 'node:http';
import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {contentDigest} from '../src/ogden-readiness.ts';
import {loadOgden,validateOgden} from '../src/ogden-content.ts';import {installOgden} from '../src/install-ogden.ts';import {prepareDatabase} from '../src/setup.ts';import {ogden} from '../src/ogden.ts';import {isolatedDatabase} from './test-db.ts';
import {previewSettings,assertPreviewConfiguration,guardPreviewRequest} from '../src/ogden-preview-policy.ts';
import {createApplication} from '../src/http.ts';
const c=await loadOgden();
test('preview cannot bind public/wildcard hosts, activate production, payments or mail; only synthetic credentials',()=>{
 assert.deepEqual(previewSettings({}),{host:'127.0.0.1',port:3100,appUrl:'http://127.0.0.1:3100'});assert.equal(previewSettings({OGDEN_PREVIEW_HOST:'192.168.1.7'}).host,'192.168.1.7');
 for(const env of [{NODE_ENV:'production'},{OGDEN_PREVIEW_HOST:'0.0.0.0'},{OGDEN_PREVIEW_HOST:'8.8.8.8'},{OGDEN_PREVIEW_HOST:'example.com'},{OGDEN_PREVIEW_PORT:'NaN'}])assert.throws(()=>previewSettings(env));
 const config={production:false,appUrl:'http://127.0.0.1:3100',mockCheckout:false,mailProvider:'disabled'};assert.doesNotThrow(()=>assertPreviewConfiguration(config));for(const damage of [{production:true},{mockCheckout:true},{manualPayment:true},{mailProvider:'smtp'},{gmail:{}},{appUrl:'https://public.example'}])assert.throws(()=>assertPreviewConfiguration({...config,...damage}));
 for(const path of ['/api/orders','/api/orders/anything','/api/admin/users','/api/payments/test','/api/gmail','/api/auth/forgot','/api/auth/reset','/payments/wechat.jpg'])assert.throws(()=>guardPreviewRequest(path,'POST','127.0.0.1:3100',config.appUrl),(e:any)=>e.status===403);
 assert.throws(()=>guardPreviewRequest('/ogden','GET','attacker.example:3100',config.appUrl),(e:any)=>e.status===403);
 assert.throws(()=>guardPreviewRequest('/api/auth/register','POST','127.0.0.1:3100',config.appUrl,{email:'real@example.com'}),(e:any)=>e.status===400);
 assert.doesNotThrow(()=>guardPreviewRequest('/api/auth/register','POST','127.0.0.1:3100',config.appUrl,{email:'test@example.invalid'}));
});
test('new clients record the version actually seen; retry remains idempotent across updates and retirement',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);await installOgden(db,c);const id=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[id,id+'@example.invalid']);
  const version=c.items.find(x=>x.id==='ow-get')!.version,body={item_id:'ow-get',item_version:version,mode:'study',status:'learned',request_id:randomUUID()};
  const call=(b:any)=>ogden({db,userId:id,method:'POST',path:'/api/ogden/results',body:b});await call(body);
  const updated=structuredClone(c);updated.version='fixture-upgrade-after-display';const w=updated.items.find(x=>x.id==='ow-get')!;w.version++;w.note='fixture only';await installOgden(db,updated);
  assert.equal((await call(body)).duplicate,true);await call({...body,request_id:randomUUID()});assert.ok((await db.query('SELECT item_version FROM ogden_practice_events')).rows.every((r:any)=>r.item_version===version));
  await assert.rejects(()=>call({...body,item_version:version+1}),(e:any)=>e.status===409);
  await assert.rejects(()=>call({...body,item_version:2147483647,request_id:randomUUID()}),(e:any)=>e.status===404);
  await assert.rejects(()=>call({...body,item_version:'bad',request_id:randomUUID()}),(e:any)=>e.status===400);
  await db.query("UPDATE ogden_items SET review_status='retired' WHERE id='ow-get'");assert.equal((await call(body)).duplicate,true);await assert.rejects(()=>call({...body,request_id:randomUUID()}),(e:any)=>e.status===404);
  assert.equal((await db.query('SELECT attempts FROM ogden_practice_progress')).rows[0].attempts,2);
 }finally{await cleanup();}
});
test('operator canonical identity and displayed forms must match declared teaching data',()=>{
 const wrong=structuredClone(c);wrong.items.find(x=>x.id==='op-get')!.wordId='ow-go';assert.throws(()=>validateOgden(wrong));
 const hidden=structuredClone(c);hidden.items.find(x=>x.id==='ow-a')!.forms=[];assert.throws(()=>validateOgden(hidden),/displayed forms/);
});
test('real preview HTTP uses test login, blocks payment/admin/real emails, rejects DNS rebinding and has no orders',async()=>{
 const {db,cleanup}=await isolatedDatabase();let server:any;try{
  await prepareDatabase(db);await installOgden(db,c);const config={production:false,appUrl:'http://127.0.0.1:3100',port:3100,mockCheckout:false,manualPayment:false,mailProvider:'disabled' as const,mailFrom:''};
  server=createApplication({...db,connect:async()=>({...db,release(){}})},config,async()=>{throw Error('No external mail');},undefined,undefined,{isolatedPreview:true});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));config.appUrl='http://127.0.0.1:'+server.address().port;
  const root=await fetch(config.appUrl);assert.match(await root.text(),/隔离测试环境/);assert.equal(root.headers.get('x-easy-english-environment'),'isolated-preview');
  const post=(path:string,body:any)=>fetch(config.appUrl+path,{method:'POST',headers:{Origin:config.appUrl,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('/api/auth/register',{email:'real@example.com',password:'test9!Password'})).status,400);
  const good=await post('/api/auth/register',{email:'preview@example.invalid',password:'test9!Password'});assert.equal(good.status,200);const cookie=good.headers.get('set-cookie')!.split(';')[0];assert.match(cookie,/^ee_ogden_preview_session=/);assert.equal((await fetch(config.appUrl+'/api/ogden/catalog',{headers:{Cookie:'ee_session='+cookie.split('=')[1]}})).status,401);
  for(const path of ['/api/orders','/api/admin/users','/api/auth/forgot','/api/payments/test'])assert.equal((await post(path,{})).status,403);
  assert.equal((await fetch(config.appUrl+'/api/ogden/catalog',{headers:{Cookie:cookie}})).status,200);await db.query("UPDATE ogden_items SET review_status='draft' WHERE id='ow-get'");const drafts=await(await fetch(config.appUrl+'/api/ogden/catalog',{headers:{Cookie:cookie}})).json();assert.equal(drafts.items.find((x:any)=>x.id==='ow-get').reviewStatus,'draft');assert.equal(drafts.coverage.coreWords,849);const rejected=await new Promise<number|undefined>((resolve,reject)=>{const req=httpRequest(config.appUrl+'/ogden',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(rejected,403);
  assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);
 }finally{if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}await cleanup();}
});

test('final quality report binds all content and duplicate references to actual developer evidence, never human/device acceptance',async()=>{
 const report=JSON.parse(await readFile(new URL('../docs/ogden/final-audit.json',import.meta.url),'utf8'));assert.equal(report.contentDigest,contentDigest(c));assert.deepEqual(report.counts,{words:850,items:1165,substitutions:198});assert.equal(report.items.length,1165);assert.equal(report.independentHumanReviews,0);assert.equal(report.coverage.coreSupportedIndependentIntents,113);assert.ok(report.exactRepeatedReferences.every((x:any)=>x.deduplicatedIntent));
 const imitation=c.items.find(x=>x.id==='ex-swap-explain')!,independent=c.items.find(x=>x.id==='ex-describe-key-use')!;assert.equal(imitation.intentId,independent.intentId);
});
