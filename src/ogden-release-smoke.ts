import {OPERATORS} from './ogden-content.ts';
type Credentials={email:string;password:string;access:'allowed'|'denied'};
export type ReleaseSmokeOptions={expect:'closed'|'open';manualPayment?:boolean;credentials?:Credentials};
/** No orders, registration, progress writes, configuration changes or migrations. Login/logout only with explicit test credentials. */
export async function releaseSmoke(base:string,options:ReleaseSmokeOptions,fetcher:typeof fetch=fetch){
 let url:URL;try{url=new URL(base);}catch{throw Error('Use a plain HTTPS site origin');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use a plain HTTPS site origin');
 if(!['closed','open'].includes(options.expect)||options.manualPayment!==undefined&&typeof options.manualPayment!=='boolean')throw Error('Invalid expected publication/payment state');
 const credentials=options.credentials;
 if(credentials&&(options.expect!=='open'||!['allowed','denied'].includes(credentials.access)||!credentials.email||!credentials.password))throw Error('Explicit open-mode test credentials and expected access are required');
 const checks:string[]=[];const origin=url.origin;
 const check=(ok:unknown,name:string)=>{if(!ok)throw Error('Smoke check failed: '+name);checks.push(name);};
 const read=async(path:string,init:RequestInit={})=>{try{return await fetcher(origin+path,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('Smoke request failed: '+path);}};
 const json=async(r:Response,name:string)=>{try{return await r.json();}catch{throw Error('Smoke data unavailable: '+name);}};
 const health=await read('/health');check(health.status===200&&(await json(health,'health')).ok===true,'database readiness');
 const home=await read('/');check(home.status===200&&(await home.text()).includes('Easy English'),'1.0 homepage');
 check(!!home.headers.get('content-security-policy')&&home.headers.get('x-content-type-options')==='nosniff','browser security headers');
 const publicResponse=await read('/api/catalog');check(publicResponse.status===200,'1.0 public catalog');const legacy=await json(publicResponse,'public catalog');
 check(legacy.features?.mockCheckout===false,'mock payment disabled');
 check(legacy.counts?.find((r:any)=>r.kind==='word')?.count===500&&legacy.counts?.find((r:any)=>r.kind==='phrase')?.count===200&&legacy.scenes?.length===20,'1.0 curriculum totals');
 check(legacy.materials?.length>0&&legacy.materials.every((m:any)=>m.is_free===true)&&legacy.dialogues?.filter((d:any)=>d.scene_id).every((d:any)=>d.is_free===true),'anonymous content filtering');
 if(options.manualPayment!==undefined)check(legacy.features.manualPayment===options.manualPayment,'existing manual-payment flag unchanged');
 check((await read('/.env')).status===404&&(await read('/data/curriculum.json')).status===404,'private files inaccessible');
 check((await read('/api/admin/users')).status===401,'anonymous administrator access denied');
 check((await read('/ogden')).status===(options.expect==='open'?200:404),'expected 2.0 page gate');
 check((await read('/api/ogden/catalog')).status===(options.expect==='open'?401:404),'expected 2.0 API gate');
 for(const asset of ['app.js','speech.js','requests.js','styles.css'])check((await read('/ogden/'+asset)).status===(options.expect==='open'?200:404),'expected 2.0 asset '+asset);
 check((await read('/ogden/preview-login.js')).status===404,'isolated preview login not published');
 if(credentials){
  const post=(path:string,body:unknown,cookie='')=>read(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  const login=await post('/api/auth/login',{email:credentials.email,password:credentials.password});check(login.status===200,'authorized test account login');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];check(!!cookie,'session issued');
  try{
   const flags=login.headers.get('set-cookie')||'';check(/HttpOnly/i.test(flags)&&/SameSite=Lax/i.test(flags)&&/; Secure/i.test(flags),'secure session flags');
   const user=(await json(login,'login')).user;check(!!user?.id&&user.must_change_password!==true,'test account identity');
   check(user.hasAccess===(credentials.access==='allowed'),'expected test account entitlement');
   const catalog=await read('/api/ogden/catalog',{headers:{Cookie:cookie!}});
   if(credentials.access==='denied'){
    check(catalog.status===403,'nonmember or expired trial denied');
    check((await read('/api/ogden/progress',{headers:{Cookie:cookie!}})).status===403,'nonmember progress denied');
   }else{
    check(catalog.status===200,'existing membership accepted');const c=await json(catalog,'2.0 catalog');
    check(c.preview===false&&c.entitlement?.productionEnabled===true&&c.entitlement?.additionalChargeCny===0,'published course without additional charge');
    check(Object.entries({word:850,operator:18,pattern:48,combination:109,expression:140}).every(([kind,count])=>c.items?.filter((x:any)=>x.kind===kind).length===count)&&OPERATORS.every(word=>c.items.some((x:any)=>x.kind==='operator'&&x.english===word)),'complete modern curriculum');
    check(c.items.reduce((n:number,x:any)=>n+(x.variants?.length||0),0)===198&&c.items.filter((x:any)=>x.kind==='expression').every((x:any)=>x.answers?.length>=2&&x.evaluation==='self-assessment'),'authored alternatives without semantic scoring');
    check(c.items.every((x:any)=>x.reviewStatus==='approved'),'only reviewed active content');
    for(const path of ['/api/ogden/progress','/api/ogden/review','/api/ogden/analytics']){
     const response=await read(path,{headers:{Cookie:cookie!}});check(response.status===200,'authorized read '+path);const data=await json(response,path);
     if(path.endsWith('/progress'))check(data.ownerId===user.id&&Array.isArray(data.progress)&&Array.isArray(data.practice),'progress belongs to signed-in test account');
    }
   }
  }finally{const logout=await post('/api/auth/logout',{},cookie);check(logout.status===200,'test session logout');}
 }
 return {checks,expectedPublication:options.expect,manualPaymentObserved:legacy.features.manualPayment,manualPaymentBaselineCheck:options.manualPayment===undefined?'NOT_RUN':'PASS',authenticatedChecks:credentials?'PASS':'NOT_RUN',progressWriteChecks:'NOT_RUN',realDeviceChecks:'NOT_RUN'};
}
