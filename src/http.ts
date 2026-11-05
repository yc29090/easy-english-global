import {assertPreviewConfiguration,guardPreviewRequest,PREVIEW_BANNER} from './ogden-preview-policy.ts';
import {gzip as gzipCallback} from 'node:zlib';
import {promisify} from 'node:util';
import {acceptsOgdenGzip} from './ogden-transfer.ts';
const gzip=promisify(gzipCallback);
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import type {DB} from './db.ts';
import type {RuntimeConfig} from './config.ts';
import {api} from './api.ts';
import {HttpError} from './security.ts';
import {ready} from './setup.ts';
import {ogdenPublicationReady} from './ogden-publication.ts';
export type ConnectionPool=DB&{connect:()=>Promise<DB&{release:()=>void}>};
const assets:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/speech-policy.js':['speech-policy.js','text/javascript; charset=utf-8'],'/english-speech.js':['english-speech.js','text/javascript; charset=utf-8'],'/playback.js':['playback.js','text/javascript; charset=utf-8'],'/learning-v2.js':['learning-v2.js','text/javascript; charset=utf-8'],'/speech-practice.js':['speech-practice.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/googleddf3db021b6b2ec7.html':['googleddf3db021b6b2ec7.html','text/html; charset=utf-8'],'/about':['about.html','text/html; charset=utf-8'],'/privacy':['privacy.html','text/html; charset=utf-8'],'/terms':['terms.html','text/html; charset=utf-8'],'/payments/wechat.jpg':['payments/wechat.jpg','image/jpeg'],'/payments/alipay.jpg':['payments/alipay.jpg','image/jpeg']};
export function createApplication(pool:ConnectionPool,config:RuntimeConfig,sendReset:(to:string,url:string)=>Promise<void>,notifyOrder?:(order:{id:string;email:string;method:string})=>Promise<void>,mailersForDb?:(db:DB)=>{sendReset:(to:string,url:string)=>Promise<void>;notifyOrder?:(order:{id:string;email:string;method:string})=>Promise<void>},options:{isolatedPreview?:boolean;ogdenPublished?:boolean}={}){
 const sessionCookie=options.isolatedPreview?'ee_ogden_preview_session':'ee_session';
 const {production}=config;if(options.isolatedPreview)assertPreviewConfiguration(config);
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control','no-store');
  try{
   const appUrl=config.appUrl;
   const url=new URL(req.url||'/',appUrl);
   if(options.isolatedPreview){res.setHeader('X-Easy-English-Environment','isolated-preview');guardPreviewRequest(url.pathname,req.method||'GET',req.headers.host,appUrl);}
   const ogdenRoute=url.pathname==='/ogden'||url.pathname.startsWith('/ogden/')||url.pathname.startsWith('/api/ogden/');
   // Default closed. Published production still uses the original authentication and membership checks.
   if(ogdenRoute&&production&&options.ogdenPublished!==true)throw new HttpError(404,'Not found');
   if(url.pathname==='/health'){
    if(!['GET','HEAD'].includes(req.method||''))throw new HttpError(405,'Method not allowed');
    let healthy=false;try{healthy=await ready(pool)&&(!production||options.ogdenPublished!==true||await ogdenPublicationReady(pool));}catch{/* A missing schema or unavailable database is not ready. */}
    res.statusCode=healthy?200:503;res.setHeader('Content-Type','application/json');res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:healthy}));return;
   }
   if(!url.pathname.startsWith('/api/')){if(url.pathname.startsWith('/payments/')&&config.manualPayment!==true)throw new HttpError(404,'Not found');const ogdenPages=['','words','operators','patterns','build','express','listening','speaking','review','progress'];const part=url.pathname.replace(/^\/ogden\/?/,'');const ogdenAsset=url.pathname==='/ogden'||url.pathname.startsWith('/ogden/');const asset=ogdenAsset?((ogdenPages.includes(part)||/^operators\/(come|get|give|go|keep|let|make|put|seem|take|be|do|have|say|see|send|may|will)$/.test(part))?['ogden/index.html','text/html; charset=utf-8']:part==='requests.js'?['ogden/requests.js','text/javascript; charset=utf-8']:part==='preview-login.js'&&options.isolatedPreview?['ogden/preview-login.js','text/javascript; charset=utf-8']:part==='app.js'?['ogden/app.js','text/javascript; charset=utf-8']:part==='cmudict-license'?['ogden/CMUDICT-LICENSE.txt','text/plain; charset=utf-8']:part==='learning.js'?['ogden/learning.js','text/javascript; charset=utf-8']:part==='speech.js'?['ogden/speech.js','text/javascript; charset=utf-8']:part==='styles.css'?['ogden/styles.css','text/css; charset=utf-8']:undefined):(options.isolatedPreview&&url.pathname==='/'?['ogden/preview-login.html','text/html; charset=utf-8']:assets[url.pathname]);if(!asset||!['GET','HEAD'].includes(req.method||''))throw new HttpError(404,'Not found');res.setHeader('Content-Type',asset[1]);const file=await readFile(fileURLToPath(new URL('../public/'+asset[0],import.meta.url)));res.end(req.method==='HEAD'?undefined:options.isolatedPreview&&asset[1].startsWith('text/html')?file.toString().replace('<body>','<body>'+PREVIEW_BANNER).replace('返回 1.0','测试账号'):file);return;}
   if(!['GET','HEAD'].includes(req.method||'')){
    if(req.headers.origin!==appUrl)throw new HttpError(403,'Invalid request origin');
    if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'JSON required');
   }
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw new HttpError(413,'Request too large');}
   let body={};try{body=raw?JSON.parse(raw):{};}catch{throw new HttpError(400,'Invalid JSON');}if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid JSON object');
   if(options.isolatedPreview)guardPreviewRequest(url.pathname,req.method||'GET',req.headers.host,appUrl,body);
   const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
   const client=await pool.connect();let data;try{const mailers=mailersForDb?.(client);data=await api({db:client,ogdenPreview:!production,method:req.method!,path:url.pathname,query:url.searchParams,gmailConfig:config.gmail,body,session:cookie,ip:req.socket.remoteAddress||'unknown',appUrl,sendReset:mailers?.sendReset??sendReset,notifyOrder:mailers?.notifyOrder??notifyOrder,manualPayment:config.manualPayment===true,mock:config.mockCheckout,passwordResetEnabled:config.mailProvider!=='disabled',onMailError:()=>console.error('Email delivery failed; check mail provider configuration')});}finally{client.release();}
   if(data.gmailRedirect){res.writeHead(303,{Location:'/?gmail=connected'});res.end();return;}
   if(data.session){res.setHeader('Set-Cookie',`${sessionCookie}=${data.session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production?'; Secure':''}`);delete data.session;}
   if(data.logout)res.setHeader('Set-Cookie',`${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${production?'; Secure':''}`);
   res.setHeader('Content-Type','application/json; charset=utf-8');const json=JSON.stringify(data);
   if(url.pathname==='/api/ogden/catalog'){res.setHeader('Vary','Accept-Encoding');if(acceptsOgdenGzip(req.headers['accept-encoding'])){const compressed=await gzip(json);res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',compressed.byteLength);res.end(compressed);return;}}
   res.end(json);
  }catch(error){const e=error as Error;res.statusCode=e instanceof HttpError?e.status:500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:res.statusCode===500?'Service temporarily unavailable':e.message}));if(res.statusCode===500)console.error('Request failed:',e.name);}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return server;
}
