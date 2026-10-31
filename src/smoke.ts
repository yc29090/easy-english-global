export async function smoke(base:string,credentials?:{email:string;password:string},fetcher:typeof fetch=fetch){
 const url=new URL(base);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol))throw new Error('Use a plain site origin without credentials, query or path');
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Public deployment checks require HTTPS');
 const origin=url.origin,checks:string[]=[];
 async function read(path:string,options:RequestInit={}){return fetcher(origin+path,{...options,redirect:'error',signal:AbortSignal.timeout(60000)});}
 function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);checks.push(message);}
 const health=await read('/health');check(health.status===200&&(await health.json()).ok===true,'Health: database migrations and curriculum ready');
 const home=await read('/');check(home.status===200&&(await home.text()).includes('Easy English'),'Homepage available');
 check(!!home.headers.get('content-security-policy')&&home.headers.get('x-content-type-options')==='nosniff','Browser security headers present');
 for(const path of ['/app.js','/playback.js','/styles.css']){const r=await read(path);check(r.status===200,'Static asset available: '+path);}
 const catalogResponse=await read('/api/catalog');check(catalogResponse.ok,'Public catalog available');const catalog=await catalogResponse.json();
 check(catalog.features?.mockCheckout===false,'Public checkout disabled');
 check(catalog.counts.find((r:any)=>r.kind==='word')?.count>=500&&catalog.counts.find((r:any)=>r.kind==='phrase')?.count>=200&&catalog.scenes.length>=20,'Curriculum totals present');
 check(catalog.materials.length>0&&catalog.materials.every((m:any)=>m.is_free===true)&&catalog.dialogues.filter((d:any)=>d.scene_id).every((d:any)=>d.is_free===true),'Anonymous users only receive free course content');
 check((await read('/api/me')).status===401,'Anonymous account request denied');
 check((await read('/api/admin/users')).status===401,'Anonymous administrator request denied');
 check((await read('/.env')).status===404&&(await read('/data/curriculum.json')).status===404,'Environment and raw curriculum are not served');
 check((await read('/api/auth/register',{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}'})).status===403,'Cross-origin writes denied');
 if(credentials){
  const response=await read('/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(credentials)});
  check(response.ok,'Test account login succeeds');
  const cookie=response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Missing session cookie');
  const flags=response.headers.get('set-cookie')||'';check(/HttpOnly/i.test(flags)&&/SameSite=Lax/i.test(flags)&&(url.protocol==='http:'||/; Secure/i.test(flags)),'Session cookie flags correct');
  try{
   check((await read('/api/progress',{headers:{Cookie:cookie}})).ok,'Cloud learning records readable');
   const order=await read('/api/orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'});check(order.status===403,'Authenticated checkout creation denied');
  }finally{await read('/api/auth/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'});}
 }
 return checks;
}
