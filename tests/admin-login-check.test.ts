import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/security.ts';
import {checkAdminLogin,adminLoginCheckMessage,adminSite} from '../src/admin-login-check.ts';
import type {AdminLoginCheck} from '../src/admin-login-check.ts';
const password='Z9!'+randomUUID(),owner={id:randomUUID(),email:'owner@example.com',role:'admin',disabled:false,password_hash:await hashPassword(password)};
function database(value:any=owner){return {query:async(sql:string,values?:any[])=>{assert.match(sql,/^SELECT /);assert.deepEqual(values,['owner@example.com']);return {rows:value?[value]:[]};}};}
const noHttp=(async()=>{assert.fail('No HTTP call is allowed');}) as typeof fetch;
test('diagnostic refuses incorrect local password without sending it to the website',async()=>{
 assert.equal(await checkAdminLogin(database(),'owner@example.com','wrong-input',noHttp),'LOCAL_PASSWORD_MISMATCH');
});
test('diagnostic refuses unknown, disabled and ordinary accounts without HTTP calls',async()=>{
 for(const value of [null,{...owner,disabled:true},{...owner,role:'user'}])assert.equal(await checkAdminLogin(database(value),'owner@example.com',password,noHttp),'LOCAL_ACCOUNT_NOT_READY');
});
test('diagnostic compares verified local identity, uses fixed HTTPS and logs out its session',async()=>{
 const paths:string[]=[];
 const fetcher=(async(url:any,options:any)=>{
  paths.push(String(url));assert.equal(options.redirect,'error');assert.equal(options.headers.Origin,adminSite);
  if(String(url).endsWith('/login')){assert.deepEqual(JSON.parse(options.body),{email:owner.email,password});return new Response(JSON.stringify({user:{id:owner.id,email:owner.email,role:'admin'}}),{headers:{'set-cookie':'session=synthetic-test-session; Secure; HttpOnly'}});}
  assert.equal(options.headers.Cookie,'session=synthetic-test-session');return new Response('{}');
 }) as typeof fetch;
 assert.equal(await checkAdminLogin(database(),'owner@example.com',password,fetcher),'WEBSITE_LOGIN_OK');
 assert.deepEqual(paths,[adminSite+'/api/auth/login',adminSite+'/api/auth/logout']);
});
test('diagnostic distinguishes website password rejection, rate limiting and service failure',async()=>{
 for(const [status,expected] of [[401,'WEBSITE_PASSWORD_REJECTED'],[429,'WEBSITE_RATE_LIMITED'],[503,'WEBSITE_UNAVAILABLE']] as const){
  assert.equal(await checkAdminLogin(database(),'owner@example.com',password,(async()=>new Response('ignored',{status})) as typeof fetch),expected);
 }
});
test('diagnostic detects a website returning a different account and still logs out',async()=>{
 let logout=false;
 const fetcher=(async(url:any)=>{if(String(url).endsWith('/logout')){logout=true;return new Response('{}');}return new Response(JSON.stringify({user:{id:'different',email:owner.email,role:'admin'}}),{headers:{'set-cookie':'session=test'}});}) as typeof fetch;
 assert.equal(await checkAdminLogin(database(),'owner@example.com',password,fetcher),'WEBSITE_ACCOUNT_MISMATCH');assert.equal(logout,true);
});
test('diagnostic handles malformed responses safely and revokes returned sessions',async()=>{
 let logout=false;
 const fetcher=(async(url:any)=>{if(String(url).endsWith('/logout')){logout=true;return new Response('{}');}return new Response('not JSON '+password,{headers:{'set-cookie':'session=test'}});}) as typeof fetch;
 assert.equal(await checkAdminLogin(database(),'owner@example.com',password,fetcher),'WEBSITE_UNAVAILABLE');assert.equal(logout,true);
 assert.equal(await checkAdminLogin(database(),'owner@example.com',password,(async()=>new Response('{}')) as typeof fetch),'WEBSITE_RESPONSE_INVALID');
});
test('diagnostic does not claim logout success if logout fails',async()=>{
 const fetcher=(async(url:any)=>String(url).endsWith('/logout')?new Response('',{status:503}):new Response(JSON.stringify({user:owner}),{headers:{'set-cookie':'session=test'}})) as typeof fetch;
 assert.equal(await checkAdminLogin(database(),'owner@example.com',password,fetcher),'WEBSITE_LOGOUT_UNCONFIRMED');
});
test('diagnostic never returns raw driver or network errors or input secrets',async()=>{
 const db={query:async()=>{throw new Error(password);}};
 assert.equal(await checkAdminLogin(db,'owner@example.com',password,noHttp),'LOCAL_CHECK_FAILED');
 assert.equal(await checkAdminLogin(database(),'owner@example.com',password,(async()=>{throw new Error(password);}) as typeof fetch),'WEBSITE_UNAVAILABLE');
 const codes:AdminLoginCheck[]=['LOCAL_ACCOUNT_NOT_READY','LOCAL_PASSWORD_MISMATCH','LOCAL_CHECK_FAILED','WEBSITE_LOGIN_OK','WEBSITE_PASSWORD_REJECTED','WEBSITE_RATE_LIMITED','WEBSITE_UNAVAILABLE','WEBSITE_RESPONSE_INVALID','WEBSITE_ACCOUNT_MISMATCH','WEBSITE_LOGOUT_UNCONFIRMED'];
 for(const code of codes){const message=adminLoginCheckMessage(code);assert.ok(message.startsWith(code));assert.ok(!message.includes(password));assert.ok(!message.includes(owner.password_hash));}
});
