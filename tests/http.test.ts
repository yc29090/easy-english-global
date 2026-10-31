import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../src/http.ts';
import type {RuntimeConfig} from '../src/config.ts';
import {prepareDatabase,ready} from '../src/setup.ts';
import {initializeAdmin} from '../src/admin-init.ts';
import {verifyPassword} from '../src/security.ts';
import {smoke} from '../src/smoke.ts';
import {isolatedDatabase} from './test-db.ts';
test('production HTTP: startup setup repeats safely, bootstrap is first-only, health and post-deploy checks work',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 const config:RuntimeConfig={production:true,appUrl:'http://localhost',port:3000,mockCheckout:false,mailProvider:'resend',mailFrom:'verified@example.com'};
 const pool={query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release:()=>{}})};
 const resetLinks:string[]=[];const server=createApplication(pool,config,async(_email,url)=>{resetLinks.push(url);});
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;config.appUrl=base;
  assert.equal((await fetch(base+'/health')).status,503);
  await prepareDatabase(db);assert.equal(await ready(db),true);assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/health',{method:'HEAD'})).status,200);
  const post=async(path:string,body:any,cookie?:string,origin=base)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const email='smoke@example.com',password='Sample-user9!for-test-only';
  const register=await post('/api/auth/register',{email,password});assert.equal(register.status,200);const user=(await register.json()).user;
  const cookie=register.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/; Secure/);
  const session=cookie.split(';')[0];const catalog=await (await fetch(base+'/api/catalog')).json();assert.equal(catalog.features.mockCheckout,false);
  const material=catalog.materials[0];
  const saved=await fetch(base+'/api/progress',{method:'PUT',headers:{Origin:base,'Content-Type':'application/json',Cookie:session},body:JSON.stringify({material_id:material.id,status:'review'})});assert.equal(saved.status,200);
  const before=(await db.query('SELECT * FROM progress WHERE user_id=$1',[user.id])).rows;
  assert.equal((await prepareDatabase(db)).alreadyInstalled,true);assert.deepEqual((await db.query('SELECT * FROM progress WHERE user_id=$1',[user.id])).rows,before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM materials')).rows[0].n,700);
  await assert.rejects(()=>initializeAdmin(db,email,'Unique9!Example-For-Tests'),/will not be overwritten/);assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[user.id])).rows[0].role,'user');
  const admin=await initializeAdmin(db,'owner@example.com','Unique9!Example-For-Tests');const adminRow=(await db.query('SELECT * FROM users WHERE id=$1',[admin.id])).rows[0];assert.equal(adminRow.role,'admin');assert.ok(await verifyPassword('Unique9!Example-For-Tests',adminRow.password_hash));
  await assert.rejects(()=>initializeAdmin(db,'second@example.com','Another9!Unique-For-Test'),/initialization is closed/);assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE role='admin'")).rows[0].n,1);
  assert.equal((await post('/api/orders',{},session)).status,403);assert.equal((await post('/api/orders/confirm',{id:'nonexistent'},session)).status,403);assert.equal((await db.query('SELECT * FROM orders')).rows.length,0);
  assert.equal((await post('/api/auth/forgot',{email})).status,200);assert.equal(resetLinks.length,1);assert.ok(resetLinks[0].startsWith(base+'/?reset='));
  assert.equal((await post('/api/auth/register',{},undefined,'https://attacker.example.com')).status,403);
  assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/data/curriculum.json')).status,404);
  const checks=await smoke(base,{email,password});assert.ok(checks.length>=17);assert.ok(checks.some(c=>c.includes('checkout creation denied')));
  const marker=(await db.query('SELECT * FROM curriculum_installs')).rows[0];await db.query("UPDATE curriculum_installs SET content_hash='not-the-installed-content'");assert.equal((await fetch(base+'/health')).status,503);await db.query('UPDATE curriculum_installs SET content_hash=$1',[marker.content_hash]);assert.equal((await fetch(base+'/health')).status,200);
  config.mailProvider='disabled';assert.equal((await post('/api/auth/forgot',{email})).status,503);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await cleanup();}
});
test('health returns 503 without leaking database errors',async()=>{
 const bad={query:async()=>{throw new Error('database-password-do-not-leak');},connect:async()=>{throw new Error('unreachable');}};
 const server=createApplication(bad,{production:false,appUrl:'http://localhost:3000',port:3000,mockCheckout:false,mailProvider:'disabled',mailFrom:''},async()=>{});
 try{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a!=='string');const response=await fetch('http://127.0.0.1:'+a.port+'/health');assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false});}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
