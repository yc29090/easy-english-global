import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig,databaseOptions} from '../src/config.ts';
import {adminPassword} from '../src/admin-init.ts';
import {resetMailer} from '../src/mail.ts';
const environment={NODE_ENV:'production',RENDER:'true',RENDER_EXTERNAL_URL:'https://example.onrender.com',ALLOW_MOCK_CHECKOUT:'false',DATABASE_URL:'postgres://learner:unique-random-database-secret@db.example.com/easy?sslmode=require',MAIL_PROVIDER:'resend',RESEND_API_KEY:'re_test_only_not_a_real_key',MAIL_FROM:'Easy English <learn@example.com>'};
test('Render production uses its real external origin, PORT and safe defaults',()=>{
 const config=loadConfig({...environment,PORT:'10000'});assert.equal(config.appUrl,'https://example.onrender.com');assert.equal(config.port,10000);assert.equal(config.mockCheckout,false);assert.equal(config.mailProvider,'resend');assert.equal(loadConfig({NODE_ENV:'test'}).mailProvider,'disabled');
});
test('unsafe production overrides and incomplete variables fail without exposing values',()=>{
 for(const overrides of [{ALLOW_MOCK_CHECKOUT:'true'},{PORT:'not-a-port'},{APP_URL:'http://unsafe.example.com'},{APP_URL:'https://example.com/path'},{APP_URL:'https://example.com/?token=secret'},{ADMIN_PASSWORD:'never-print-this-secret'},{MAIL_PROVIDER:'resend',RESEND_API_KEY:''},{MAIL_PROVIDER:'smtp',SMTP_HOST:'smtp.example.com'},{NODE_ENV:'development',RENDER:'true'}])assert.throws(()=>loadConfig({...environment,...overrides}));
 assert.throws(()=>loadConfig({...environment,APP_URL:'https://user:never-print-this-secret@example.com'}),e=>!String(e).includes('never-print-this-secret'));
 assert.throws(()=>loadConfig({NODE_ENV:'production',MAIL_PROVIDER:'disabled'}),/APP_URL/);
 assert.equal(loadConfig({...environment,MAIL_PROVIDER:'disabled'}).mailProvider,'disabled');
});
test('PostgreSQL TLS verification remains enabled even when connection URL uses sslmode=require',()=>{
 const options=databaseOptions(environment);assert.ok(options.ssl);assert.equal(options.ssl.rejectUnauthorized,true);assert.ok(!options.connectionString.includes('sslmode'));
 assert.equal(options.max,5);assert.equal(databaseOptions({DATABASE_URL:'postgres://localhost/test'}).ssl,false);
 for(const overrides of [{DATABASE_URL:''},{DATABASE_SSL:'disable'},{DATABASE_URL:'https://example.com/db'},{DATABASE_URL:'postgres://postgres:postgres@db.example.com/easy'},{DATABASE_URL:'not-a-url-with-secret'}])assert.throws(()=>databaseOptions({...environment,...overrides}),/DATABASE/);
});
test('administrator initialization accepts no default or weak passwords',()=>{
 for(const value of ['admin','admin123456789012!','ChangeMe123456789!','password123456789!','aaaaaaaaaaaaaaaa','onlylowercasecharacters'])assert.throws(()=>adminPassword(value));
 assert.equal(adminPassword('Unique9!Example-For-Tests'),'Unique9!Example-For-Tests');
});
test('HTTPS email delivery sends the reset link without logging or using SMTP',async()=>{
 let observed:any;const fetcher=(async(url:any,options:any)=>{observed={url,options};return new Response('{}',{status:200});}) as typeof fetch;
 const config=loadConfig(environment);await resetMailer(config,fetcher)('recipient@example.com','https://example.onrender.com/?reset=private-token');
 assert.equal(observed.url,'https://api.resend.com/emails');assert.equal(observed.options.headers.Authorization,'Bearer '+environment.RESEND_API_KEY);const payload=JSON.parse(observed.options.body);assert.match(payload.text,/reset=private-token/);assert.deepEqual(payload.to,['recipient@example.com']);
 await assert.rejects(()=>resetMailer(config,(async()=>new Response('{}',{status:403})) as typeof fetch)('test@example.com','https://example.com'),/delivery failed/);
 await assert.rejects(()=>resetMailer(loadConfig({NODE_ENV:'test'}))('test@example.com','https://example.com'),/disabled/);
});
