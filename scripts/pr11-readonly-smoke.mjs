// Standalone deployment probe on an operations branch. Never merged into app code.
// Public GET requests only: no credentials, login submissions, accounts, orders or progress writes.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from '@playwright/test';
const request=JSON.parse(await readFile('deployments/pr11-smoke-request.json','utf8'));
assert.ok(['baseline','post'].includes(request.stage));assert.match(request.expectedApplicationCommit,/^[0-9a-f]{40}$/);
const site='https://easy-english-global.onrender.com',checks=[],evidence={stage:request.stage,expectedApplicationCommit:request.expectedApplicationCommit,startedAt:new Date().toISOString(),productionWrites:0,newAccounts:0,browsers:[]};
let phase='initialization';
const check=(value,label)=>{phase=label;assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
async function read(path){
 phase='GET '+path;let last;
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(site+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(60000)});if(r.status<500||attempt===2)return r;last=new Error('Service not ready');}catch(e){last=e;if(attempt===2)throw e;}
  await new Promise(r=>setTimeout(r,5000));
 }throw last;
}
try{
 await mkdir('artifacts/pr11-readonly',{recursive:true});
 const health=await read('/health');check(health.status===200&&(await health.json()).ok===true,'Live HTTPS health and database readiness');
 const catalogResponse=await read('/api/catalog');check(catalogResponse.status===200,'Live public catalog');const catalog=await catalogResponse.json();
 evidence.features={manualPayment:catalog.features.manualPayment,mockCheckout:catalog.features.mockCheckout,passwordReset:catalog.features.passwordReset};
 evidence.counts={words:catalog.counts.find(x=>x.kind==='word')?.count,phrases:catalog.counts.find(x=>x.kind==='phrase')?.count,scenes:catalog.scenes.length};
 check(evidence.counts.words===500&&evidence.counts.phrases===200&&evidence.counts.scenes===20,'Existing 500 words, 200 phrases and 20 scenes');
 check(evidence.features.mockCheckout===false,'Production mock checkout stays disabled');
 if(request.expectedFeatures)check(JSON.stringify(evidence.features)===JSON.stringify(request.expectedFeatures),'Existing manual payment and reset rules unchanged');
 evidence.assetHashes={};
 for(const [path,file] of [['/','public/index.html'],['/app.js','public/app.js'],['/styles.css','public/styles.css'],['/playback.js','public/playback.js'],['/ogden','public/ogden/index.html'],['/ogden/app.js','public/ogden/app.js'],['/ogden/styles.css','public/ogden/styles.css']]){
  const live=await read(path);check(live.status===200,'Live resource '+path);
  const expected=await fetch('https://raw.githubusercontent.com/yc29090/easy-english-global/'+request.expectedApplicationCommit+'/'+file,{signal:AbortSignal.timeout(60000)});check(expected.status===200,'Pinned source '+file);
  const hash=value=>createHash('sha256').update(value).digest('hex'),actual=hash(await live.text());check(actual===hash(await expected.text()),'Deployed bytes match pinned commit '+file);evidence.assetHashes[path]=actual;
 }
 for(const path of ['/api/me','/api/admin/users','/api/ogden/catalog'])check((await read(path)).status===401,'Anonymous access correctly denied '+path);
 for(const path of ['/ogden/words?q=water','/ogden/operators/get','/ogden/patterns','/ogden/build','/ogden/express','/ogden/listening','/ogden/speaking','/ogden/review'])check((await read(path)).status===200,'Existing modern deep link '+path);
 for(const [name,engine,device] of [['android-chromium',chromium,'Pixel 7'],['iphone-webkit',webkit,'iPhone 13']]){
  phase='Public browser '+name;const browser=await engine.launch();
  try{
   const context=await browser.newContext({...devices[device]});const page=await context.newPage(),writes=[];
   await page.route('**/*',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){writes.push(route.request().method());return route.abort();}return route.continue();});
   await page.goto(site+'/',{waitUntil:'networkidle',timeout:90000});
   if(request.stage==='post'){
    await page.locator('.version-card').first().waitFor();check(await page.locator('.version-card').count()===2,name+' exposes both version cards');
    check(await page.locator('[data-version="modern"]').getAttribute('href')==='/ogden',name+' modern entry target');
    await page.screenshot({path:'artifacts/pr11-readonly/'+name+'-homepage.png',fullPage:true});
    await page.locator('[data-version="classic"]').click();await page.locator('[data-continue]').waitFor();check(page.url()===site+'/?version=classic',name+' classic overview route');
    await page.locator('.topactions [data-page="home"]').click();await page.locator('.version-picker').waitFor();
    await page.locator('[data-version="modern"]').click();await page.locator('#content a[href="/?login=1"]').waitFor();
    check(new URL(page.url()).pathname==='/ogden',name+' modern entry preserves existing authentication');
    await page.locator('.version-actions a[href="/"]').click();await page.locator('.version-picker').waitFor();
    await page.goto(site+'/?login=1',{waitUntil:'networkidle'});await page.locator('#auth-form').waitFor();check(await page.locator('#modal').isVisible(),name+' existing login dialog opens from version home');await page.locator('#close-modal').click();
    await page.goto(site+'/?version=classic&page=membership',{waitUntil:'networkidle'});await page.locator('.plan.featured .price').waitFor();check((await page.locator('.plan.featured .price').innerText()).includes('99'),name+' unchanged CNY99 lifetime membership page');
   }else{
    await page.locator('[data-continue]').waitFor();await page.locator('[data-page="words"]').first().click();await page.locator('.materials').waitFor();check(true,name+' existing classic free lessons load');
   }
   await page.goto(site+'/ogden/words?q=water#word-water',{waitUntil:'networkidle'});await page.locator('#content a').first().waitFor();check(page.url()===site+'/ogden/words?q=water#word-water',name+' modern query and fragment preserved');
   const back=page.locator(request.stage==='post'?'.version-actions a[href="/"]':'header a[href="/"]');await back.click();await page.locator(request.stage==='post'?'.version-picker':'[data-continue]').waitFor();
   await page.setViewportSize({width:320,height:640});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' narrow viewport has no horizontal overflow');
   check(writes.length===0,name+' made no production write requests');evidence.browsers.push({name,passed:true});
  }finally{await browser.close();}
 }
 evidence.passed=checks.length;evidence.finishedAt=new Date().toISOString();await writeFile('artifacts/pr11-readonly/summary.json',JSON.stringify(evidence,null,2));console.log('READONLY_RELEASE_EVIDENCE '+JSON.stringify(evidence));
}catch{console.error('READONLY_SMOKE_FAILED at safe phase '+phase);process.exitCode=1;}
