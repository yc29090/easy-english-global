import {test} from 'node:test';import assert from 'node:assert/strict';
import {requestId,pendingResults,ogdenRequest} from '../public/ogden/requests.js';
test('secure UUID fallback works on private HTTP; no insecure randomness or silent save when crypto is absent',()=>{
 const id=requestId({getRandomValues:b=>{b.fill(17);return b;}});assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.throws(()=>requestId({}),/安全请求编号/);
});
test('pending results survive reload, retain displayed version, isolate accounts and clear only confirmed saves',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const first=pendingResults(storage);first.owner('alice');const a=first.get('ow-get','study','learned',3);
 const reload=pendingResults(storage);reload.owner('alice');assert.deepEqual(reload.get('ow-get','study','learned',4),a);
 reload.owner('bob');const b=reload.get('ow-get','study','learned',4);assert.notEqual(a.request_id,b.request_id);
 reload.owner('alice');assert.deepEqual(reload.get('ow-get','study','learned',4),a);reload.confirm('ow-get');assert.notEqual(reload.get('ow-get','study','learned',4).request_id,a.request_id);
 const blocked=pendingResults({getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}});blocked.owner('a');assert.equal(blocked.persistent,false);assert.equal(blocked.get('w','study','learned',1).request_id,blocked.get('w','study','learned',2).request_id);
});
test('HTTP error, malformed gateway response and timeout are distinct and never return a fake saved result',async()=>{
 await assert.rejects(()=>ogdenRequest('/ogden/results','POST',{}, {fetch:async()=>({ok:false,status:403,json:async()=>({error:'Denied'})})}),e=>e.status===403);
 await assert.rejects(()=>ogdenRequest('/ogden/results','POST',{}, {fetch:async()=>({json:async()=>{throw Error('private upstream payload');}})}),/暂未返回有效数据/);
 await assert.rejects(()=>ogdenRequest('/ogden/results','POST',{}, {timeout:5,fetch:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))))}),/超时/);
});
