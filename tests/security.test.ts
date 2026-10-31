import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,member,email,password,days,publicUser,token,digest} from '../src/security.ts';
import {validateContent} from '../src/content.ts';
import {api} from '../src/api.ts';
test('passwords are salted and verified without storing plaintext',async()=>{const a=await hashPassword('safe-password-123'),b=await hashPassword('safe-password-123');assert.notEqual(a,b);assert.equal(await verifyPassword('safe-password-123',a),true);assert.equal(await verifyPassword('wrong',a),false);});
test('trial access expires at its exact deadline',()=>{assert.equal(member({membership:'trial',trial_until:'2026-01-01'},Date.parse('2026-01-01')),false);assert.equal(member({membership:'trial',trial_until:'2026-01-02'},Date.parse('2026-01-01')),true);assert.equal(member({membership:'free'}),false);assert.equal(member({membership:'lifetime'}),true);});
test('input validation rejects out-of-range and malformed values',()=>{for(const v of [0,91,1.5,'7',null])assert.throws(()=>days(v));assert.equal(days(90),90);assert.equal(email('Person@Example.com'),'person@example.com');assert.throws(()=>email('bad'));assert.throws(()=>password('short'));assert.throws(()=>password('a'.repeat(129)));});
test('session tokens have entropy and public user omits password hashes',()=>{const a=token();assert.notEqual(a,token());assert.equal(digest(a).length,64);assert.equal('password_hash' in publicUser({password_hash:'secret',membership:'free'}),false);});
test('missing and repeated curriculum is rejected',()=>{
 assert.throws(()=>validateContent({scenes:[],materials:[],dialogues:[]}));
 const data=JSON.parse(readFileSync(new URL('../data/curriculum.json',import.meta.url),'utf8'));
 assert.equal(validateContent(data),data);data.materials[1].english=data.materials[0].english.toUpperCase();assert.throws(()=>validateContent(data),/Duplicate/);
});
test('anonymous writes are denied by server, independent of interface',async()=>{await assert.rejects(()=>api({db:{query:async()=>({rows:[]})},method:'PATCH',path:'/api/admin/users',body:{action:'lifetime'},ip:'test',sendReset:async()=>{},appUrl:'http://localhost',mock:true}),{status:401});});
test('authenticated non-admin cannot perform admin operations',async()=>{await assert.rejects(()=>api({db:{query:async()=>({rows:[{id:'u',role:'user',membership:'free'}]})},session:'test',method:'POST',path:'/api/admin/trials',body:{},ip:'test',sendReset:async()=>{},appUrl:'http://localhost',mock:true}),{status:403});});
