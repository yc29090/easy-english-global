/** Secure UUID entropy also works on private HTTP LANs where randomUUID may be absent. */
export function requestId(crypto=globalThis.crypto){
 if(crypto?.randomUUID){try{return crypto.randomUUID();}catch{/* Try secure bytes on restricted LAN contexts. */}}
 if(!crypto?.getRandomValues)throw Error('此浏览器无法生成安全请求编号，请换用受支持的浏览器。');
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function ogdenRequest(path,method='GET',body,{fetch=globalThis.fetch,timeout=20000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const r=await fetch('/api'+path,{method,signal:controller.signal,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});let data;try{data=await r.json();}catch{throw Error('服务暂未返回有效数据，请重试。');}if(!r.ok){const error=new Error(typeof data?.error==='string'?data.error:'请求失败，请稍后重试。');error.status=r.status;throw error;}return data;}
 catch(e){if(e.name==='AbortError')throw Error('网络等待超时，保存结果可能尚未确认；请重试，不会重复计数。');throw e;}
 finally{clearTimeout(timer);}
}
/** Pending IDs are scoped to the authenticated owner and retained only for the current tab. */
export function pendingResults(storage){
 if(arguments.length===0){try{storage=globalThis.sessionStorage;}catch{storage=undefined;}}
 let owner='',pending=new Map(),persistent=!!storage;
 const key=()=>`ogden-pending:${owner}`;
 const persist=()=>{try{if(owner)storage?.setItem(key(),JSON.stringify([...pending]));}catch{persistent=false;/* In-memory retry remains available if storage is blocked. */}};
 return {
  get persistent(){return persistent;},
  owner(id){if(owner===id)return;owner=id;pending=new Map();try{const rows=JSON.parse(storage?.getItem(key())||'[]');if(Array.isArray(rows))for(const [k,v] of rows.slice(-50))if(typeof k==='string'&&v&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v.request_id)&&v.item_id===k&&(v.item_version===undefined||(Number.isInteger(v.item_version)&&v.item_version>0&&v.item_version<=2147483647))&&['study','build','express','listening','speaking'].includes(v.mode)&&['learned','mastered','unmastered','review'].includes(v.status))pending.set(k,v);}catch{persistent=false;pending.clear();}},
  get(item,mode,status,version){const saved=pending.get(item);if(saved&&saved.mode===mode&&saved.status===status)return saved;const body={item_id:item,mode,status,item_version:version,request_id:requestId()};pending.set(item,body);if(pending.size>50)pending.delete(pending.keys().next().value);persist();return body;},
  confirm(item){pending.delete(item);persist();}
 };
}
