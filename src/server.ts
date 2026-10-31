import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {database} from './db.ts';
import {api} from './api.ts';
import {HttpError} from './security.ts';
import {sendReset} from './mail.ts';
const pool=database(),production=process.env.NODE_ENV==='production',appUrl=process.env.APP_URL||'http://localhost:3000';
if(production&&!appUrl.startsWith('https://'))throw new Error('Production requires HTTPS APP_URL');
const assets:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8']};
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
 const url=new URL(req.url||'/',appUrl);res.setHeader('Cache-Control','no-store');
 try{
  if(url.pathname==='/health'){await pool.query('SELECT 1');res.end('ok');return;}
  if(!url.pathname.startsWith('/api/')){const asset=assets[url.pathname];if(!asset||req.method!=='GET')throw new HttpError(404,'Not found');res.setHeader('Content-Type',asset[1]);res.end(await readFile(fileURLToPath(new URL('../public/'+asset[0],import.meta.url))));return;}
  if(!['GET','HEAD'].includes(req.method||'')){
   if(req.headers.origin!==new URL(appUrl).origin)throw new HttpError(403,'Invalid request origin');
   if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'JSON required');
  }
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw new HttpError(413,'Request too large');}
  let body={};try{body=raw?JSON.parse(raw):{};}catch{throw new HttpError(400,'Invalid JSON');}if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid JSON object');
  const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('ee_session='))?.slice(11);
  const client=await pool.connect();let data;try{data=await api({db:client,method:req.method!,path:url.pathname,body,session:cookie,ip:req.socket.remoteAddress||'unknown',appUrl,sendReset,mock:process.env.ALLOW_MOCK_CHECKOUT==='true'});}finally{client.release();}
  if(data.session){res.setHeader('Set-Cookie',`ee_session=${data.session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production?'; Secure':''}`);delete data.session;}
  if(data.logout)res.setHeader('Set-Cookie',`ee_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${production?'; Secure':''}`);
  res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));
 }catch(error){const e=error as Error;res.statusCode=e instanceof HttpError?e.status:500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:res.statusCode===500?'Service temporarily unavailable':e.message}));if(res.statusCode===500)console.error('Request failed:',e.name);}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Easy English listening on port '+(process.env.PORT||3000)));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>{void pool.end();});});
