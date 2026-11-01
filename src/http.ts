import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type {DB} from './db.ts';
import type {RuntimeConfig} from './config.ts';
import {api} from './api.ts';
import {HttpError} from './security.ts';
import {ready} from './setup.ts';
export type ConnectionPool=DB&{connect:()=>Promise<DB&{release:()=>void}>};
const assets:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/playback.js':['playback.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/payments/wechat.jpg':['payments/wechat.jpg','image/jpeg'],'/payments/alipay.jpg':['payments/alipay.jpg','image/jpeg']};
export function createApplication(pool:ConnectionPool,config:RuntimeConfig,sendReset:(to:string,url:string)=>Promise<void>,notifyOrder?:(order:{id:string;email:string;method:string})=>Promise<void>){
 const {production}=config;
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control','no-store');
  try{
   const appUrl=config.appUrl;
   const url=new URL(req.url||'/',appUrl);
   if(url.pathname==='/health'){
    if(!['GET','HEAD'].includes(req.method||''))throw new HttpError(405,'Method not allowed');
    let healthy=false;try{healthy=await ready(pool);}catch{/* A missing schema or unavailable database is not ready. */}
    res.statusCode=healthy?200:503;res.setHeader('Content-Type','application/json');res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:healthy}));return;
   }
   if(!url.pathname.startsWith('/api/')){if(url.pathname.startsWith('/payments/')&&config.manualPayment!==true)throw new HttpError(404,'Not found');const asset=assets[url.pathname];if(!asset||!['GET','HEAD'].includes(req.method||''))throw new HttpError(404,'Not found');res.setHeader('Content-Type',asset[1]);const file=await readFile(fileURLToPath(new URL('../public/'+asset[0],import.meta.url)));res.end(req.method==='HEAD'?undefined:file);return;}
   if(!['GET','HEAD'].includes(req.method||'')){
    if(req.headers.origin!==appUrl)throw new HttpError(403,'Invalid request origin');
    if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'JSON required');
   }
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw new HttpError(413,'Request too large');}
   let body={};try{body=raw?JSON.parse(raw):{};}catch{throw new HttpError(400,'Invalid JSON');}if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid JSON object');
   const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('ee_session='))?.slice(11);
   const client=await pool.connect();let data;try{data=await api({db:client,method:req.method!,path:url.pathname,body,session:cookie,ip:req.socket.remoteAddress||'unknown',appUrl,sendReset,notifyOrder,manualPayment:config.manualPayment===true,mock:config.mockCheckout,passwordResetEnabled:config.mailProvider!=='disabled',onMailError:()=>console.error('Email delivery failed; check mail provider configuration')});}finally{client.release();}
   if(data.session){res.setHeader('Set-Cookie',`ee_session=${data.session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production?'; Secure':''}`);delete data.session;}
   if(data.logout)res.setHeader('Set-Cookie',`ee_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${production?'; Secure':''}`);
   res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));
  }catch(error){const e=error as Error;res.statusCode=e instanceof HttpError?e.status:500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:res.statusCode===500?'Service temporarily unavailable':e.message}));if(res.statusCode===500)console.error('Request failed:',e.name);}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return server;
}
