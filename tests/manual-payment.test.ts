import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {api} from '../src/api.ts';
import {migrate} from '../src/migrations.ts';
import {isolatedDatabase} from './test-db.ts';
import {digest} from '../src/security.ts';
import {loadConfig} from '../src/config.ts';

test('manual configuration fails closed until receiving, mail and security acceptance',()=>{
 assert.equal(loadConfig({}).manualPayment,false);
 assert.throws(()=>loadConfig({MANUAL_PAYMENT_ENABLED:'yes'}));
 assert.throws(()=>loadConfig({MANUAL_PAYMENT_ENABLED:'true'}));
 assert.throws(()=>loadConfig({MANUAL_PAYMENT_ENABLED:'true',MANUAL_PAYMENT_ACCEPTANCE_VERIFIED:'true',MAIL_PROVIDER:'disabled'}));
 assert.equal(loadConfig({MANUAL_PAYMENT_ENABLED:'true',MANUAL_PAYMENT_ACCEPTANCE_VERIFIED:'true',MAIL_PROVIDER:'resend',MAIL_FROM:'orders@example.com',RESEND_API_KEY:'test-key-without-secrets'}).manualPayment,true);
});

test('manual migration preserves legacy orders/accounts/progress and repeated application',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 try{
  await migrate(db);
  const id=randomUUID(),old=randomUUID();
  await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,'legacy@example.com','retained')",[id]);
  await db.query('INSERT INTO orders(id,user_id) VALUES($1,$2)',[old,id]);
  // Replay only additive manual migrations over existing data.
  await db.query("DELETE FROM schema_migrations WHERE name IN ('004_manual_payment.sql','005_manual_payment_safety.sql')");
  await migrate(db);await migrate(db);
  assert.equal((await db.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0].password_hash,'retained');
  assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[old])).rows[0].status,'pending');
  const manual=randomUUID();
  await db.query("INSERT INTO orders(id,user_id,payment_method,status) VALUES($1,$2,'wechat','payment_claimed')",[manual,id]);
  await assert.rejects(()=>db.query("INSERT INTO orders(id,user_id,payment_method) VALUES($1,$2,'alipay')",[randomUUID(),id]),/unique|duplicate/i);
 }finally{await cleanup();}
});

test('manual orders require enabled flag, ownership and administrator verified settlement; failed mail can retry',async()=>{
 const {db,cleanup}=await isolatedDatabase();
 try{
  await migrate(db);
  const user=randomUUID(),other=randomUUID(),admin=randomUUID();
  for(const [id,role] of [[user,'user'],[other,'user'],[admin,'admin']]){
   await db.query('INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4)',[id,id+'@example.com','retained',role]);
   await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[digest(id),id]);
  }
  let sends=0,fail=true;
  const call=(path:string,body:any={},session=user,enabled=true,method='POST')=>api({db,path:'/api'+path,method,body,session,manualPayment:enabled,mock:false,ip:randomUUID(),appUrl:'https://example.com',sendReset:async()=>{},notifyOrder:async()=>{sends++;if(fail)throw new Error('private credential must not leak');}});
  await assert.rejects(()=>call('/orders/manual',{method:'wechat'},user,false),{status:503});
  assert.equal((await call('/catalog',{},user,false,'GET')).features.manualPayment,false);
  await assert.rejects(()=>call('/orders/manual',{method:'wechat'},admin),{status:403});
  const order=(await call('/orders/manual',{method:'wechat',amount_fen:1,status:'paid'})).order;
  assert.equal(order.amount_fen,9900);assert.equal(order.currency,'CNY');
  assert.equal((await call('/orders/manual',{method:'alipay'})).order.id,order.id);
  await assert.rejects(()=>call('/orders/manual/claim',{id:order.id},other),{status:404});
  await assert.rejects(()=>call('/orders/manual/claim',{id:order.id},user,false),{status:503});
  await call('/orders/manual/claim',{id:order.id});
  assert.equal((await db.query('SELECT membership FROM users WHERE id=$1',[user])).rows[0].membership,'free');
  assert.equal((await db.query('SELECT status FROM order_notifications WHERE order_id=$1',[order.id])).rows[0].status,'failed');
  await assert.rejects(()=>call('/admin/orders',{},user,true,'GET'),{status:403});
  await assert.rejects(()=>call('/admin/orders/notify',{id:order.id},user),{status:403});
  fail=false;await call('/admin/orders/notify',{id:order.id},admin);
  await call('/orders/manual/claim',{id:order.id});
  assert.equal(sends,2);
  const listing=(await call('/admin/orders',{},admin,true,'GET')).orders;
  assert.equal(listing[0].notification_status,'sent');assert.equal(listing[0].notification_attempts,2);
  await assert.rejects(()=>call('/admin/orders/review',{id:order.id,action:'approve',verified:true},user),{status:403});
  await assert.rejects(()=>call('/admin/orders/review',{id:order.id,action:'approve'},admin),{status:403});
  await assert.rejects(()=>call('/admin/orders/review',{id:order.id,action:'approve',verified:true},admin,false),{status:403});
  await call('/admin/orders/review',{id:order.id,action:'approve',verified:true},admin);
  await call('/admin/orders/review',{id:order.id,action:'approve',verified:true},admin);
  assert.equal((await db.query('SELECT membership FROM users WHERE id=$1',[user])).rows[0].membership,'lifetime');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action=$1",['manual_order_approve:'+order.id])).rows[0].n,1);
  await assert.rejects(()=>call('/admin/orders/review',{id:order.id,action:'reject'},admin),{status:409});
  const reject=(await call('/orders/manual',{method:'alipay'},other)).order;
  await call('/orders/manual/claim',{id:reject.id},other);
  await call('/admin/orders/review',{id:reject.id,action:'reject'},admin);
  await call('/admin/orders/review',{id:reject.id,action:'reject'},admin);
  assert.equal((await db.query('SELECT membership FROM users WHERE id=$1',[other])).rows[0].membership,'free');
  assert.notEqual((await call('/orders/manual',{method:'wechat'},other)).order.id,reject.id);
 }finally{await cleanup();}
});

test('PostgreSQL concurrent creation and reviews produce one order and one audit event',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires independent PostgreSQL connections; exercised in CI');return;}
 const {default:pg}=await import('pg');
 const setup=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await setup.connect();
 const schema='ee_concurrent_'+randomUUID().replaceAll('-','');
 const clients:InstanceType<typeof pg.Client>[]=[];
 try{
  await setup.query('CREATE SCHEMA '+schema);await setup.query('SET search_path TO '+schema);await migrate(setup);
  const user=randomUUID(),admin=randomUUID();
  for(const [id,role] of [[user,'user'],[admin,'admin']]){
   await setup.query('INSERT INTO users(id,email,password_hash,role) VALUES($1,$2,$3,$4)',[id,id+'@example.com','retained',role]);
   await setup.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[digest(id),id]);
  }
  for(let i=0;i<4;i++){const c=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await c.connect();clients.push(c);await c.query('SET search_path TO '+schema);}
  const call=(db:any,path:string,body:any,session=user)=>api({db,path:'/api'+path,method:'POST',body,session,manualPayment:true,mock:false,ip:randomUUID(),appUrl:'https://example.com',sendReset:async()=>{},notifyOrder:async()=>{}});
  const orders=await Promise.all(clients.map(c=>call(c,'/orders/manual',{method:'wechat'})));
  const id=orders[0].order.id;assert.ok(orders.every(o=>o.order.id===id));
  await call(clients[0],'/orders/manual/claim',{id});
  await Promise.all(clients.map(c=>call(c,'/admin/orders/review',{id,action:'approve',verified:true},admin)));
  assert.equal((await setup.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,1);
  assert.equal((await setup.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n,1);
 }finally{
  for(const c of clients)await c.end();
  await setup.query('SET search_path TO public');await setup.query('DROP SCHEMA '+schema+' CASCADE');await setup.end();
 }
});
