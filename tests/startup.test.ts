import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runStartup,classifyStartupError,StartupFailure} from '../src/startup.ts';
import type {StartupDependencies,StartupEvent} from '../src/startup.ts';
import {ConfigError,loadConfig,databaseOptions} from '../src/config.ts';
const secret='NEVER_LOG_THIS_SYNTHETIC_CREDENTIAL';
const failure=(code:string)=>Object.assign(new Error('postgres://owner:'+secret+'@example.invalid/db'),{code,detail:secret});
function harness(){
 const events:StartupEvent[]=[],delays:number[]=[],releases:boolean[]=[];
 let pools=0,ends=0,connects=0,prepares=0,starts=0;
 const state={connectError:undefined as unknown,prepareError:undefined as unknown,endError:undefined as unknown,encrypted:true,authorized:true};
 const deps:StartupDependencies={
  config:()=>({...loadConfig({NODE_ENV:'test'}),production:true}),
  pool:()=>{pools++;return {
   on:()=>{},end:async()=>{ends++;if(state.endError)throw state.endError;},
   connect:async()=>{connects++;if(state.connectError){const e=state.connectError;state.connectError=undefined;throw e;}return {query:async()=>({rows:[]}),release:(destroy)=>releases.push(!!destroy),connection:{stream:{encrypted:state.encrypted,authorized:state.authorized,getProtocol:()=> 'TLSv1.3'}}};}
  };},
  prepare:async()=>{prepares++;if(state.prepareError){const e=state.prepareError;state.prepareError=undefined;throw e;}return {alreadyInstalled:true};},
  start:async()=>{starts++;},log:e=>events.push(e),wait:async ms=>{delays.push(ms);}
 };
 return {deps,state,events,delays,releases,counts:()=>({pools,ends,connects,prepares,starts})};
}
test('successful startup verifies TLS, prepares once, closes bootstrap pool and starts HTTP',async()=>{
 const h=harness();await runStartup(h.deps);assert.deepEqual(h.counts(),{pools:1,ends:1,connects:1,prepares:1,starts:1});assert.deepEqual(h.releases,[false]);assert.ok(h.events.some(e=>e.stage==='database-tls'&&e.status==='verified'&&e.protocol==='TLSv1.3'));
});
test('transient connection failure retries using a fresh pool, with bounded backoff',async()=>{
 const h=harness();h.state.connectError=failure('ETIMEDOUT');await runStartup(h.deps);assert.equal(h.counts().pools,2);assert.equal(h.counts().ends,2);assert.equal(h.counts().prepares,1);assert.deepEqual(h.delays,[2000]);assert.ok(!JSON.stringify(h.events).includes(secret));
});
test('temporary prepare timeout closes the failed client before retrying idempotent setup',async()=>{
 const h=harness();h.state.prepareError=failure('57014');await runStartup(h.deps);assert.deepEqual(h.releases,[true,false]);assert.equal(h.counts().prepares,2);assert.equal(h.counts().starts,1);
});
test('invalid database password is diagnosed once without retrying or logging credentials',async()=>{
 const h=harness();h.state.connectError=failure('28P01');await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.stage==='database-connect'&&e.code==='DB_AUTHENTICATION_FAILED');assert.equal(h.counts().connects,1);assert.equal(h.counts().starts,0);assert.deepEqual(h.delays,[]);assert.ok(h.events.some(e=>e.code==='DB_AUTHENTICATION_FAILED'&&e.sourceCode==='28P01'));assert.ok(!JSON.stringify(h.events).includes(secret));
});
test('nested network errors are classified but unknown error data is excluded',()=>{
 assert.equal(classifyStartupError(new Error(secret,{cause:failure('ECONNRESET')}),'database-connect').retryable,true);assert.equal(classifyStartupError(failure(secret),'database-connect').retryable,false);assert.ok(!JSON.stringify(classifyStartupError(failure(secret),'database-connect')).includes(secret));
});
test('certificate failure never falls back to insecure TLS or loops',async()=>{
 const h=harness();h.state.connectError=failure('ERR_TLS_CERT_ALTNAME_INVALID');await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.code==='DB_TLS_VERIFICATION_FAILED');assert.equal(h.counts().connects,1);assert.equal(h.counts().prepares,0);assert.deepEqual(h.delays,[]);
});
test('a connected socket with unverified or unencrypted TLS is rejected',async()=>{
 for(const setting of ['encrypted','authorized'] as const){const h=harness();h.state[setting]=false;await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.stage==='database-tls');assert.equal(h.counts().prepares,0);assert.equal(h.counts().starts,0);assert.deepEqual(h.releases,[true]);}
});
test('configuration errors log only the variable name and stop before connecting',async()=>{
 const h=harness();h.deps.config=()=>{throw new ConfigError('DATABASE_URL ('+secret+')');};await assert.rejects(()=>runStartup(h.deps));assert.equal(h.counts().pools,0);assert.ok(h.events.some(e=>e.variable==='DATABASE_URL'));assert.ok(!JSON.stringify(h.events).includes(secret));
});
test('pool construction failure is distinguished from a network connection failure',async()=>{
 const h=harness();h.deps.pool=()=>{throw new ConfigError('DATABASE_SSL');};await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.stage==='database-options');assert.equal(h.counts().starts,0);assert.deepEqual(h.delays,[]);
});
test('persistent transient failure stops after four attempts and closes every pool',async()=>{
 const h=harness();let pools=0,ends=0;h.deps.pool=()=>{pools++;return {end:async()=>{ends++;},connect:async()=>{throw failure('57P03');}};};await assert.rejects(()=>runStartup(h.deps));assert.deepEqual(h.delays,[2000,4000,8000]);assert.equal(pools,4);assert.equal(ends,4);assert.equal(h.events.filter(e=>e.event==='startup_failure').length,4);assert.equal(h.counts().starts,0);
});
test('curriculum conflict is not retried or treated as permission to overwrite data',async()=>{
 const h=harness();h.state.prepareError=new Error('Installed version differs '+secret);await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.code==='CURRICULUM_CONFLICT');assert.equal(h.counts().prepares,1);assert.equal(h.counts().starts,0);assert.ok(!JSON.stringify(h.events).includes(secret));
});
test('cleanup errors cannot replace the original authentication diagnosis',async()=>{
 const h=harness();h.state.connectError=failure('28P01');h.state.endError=failure('ECONNRESET');await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.code==='DB_AUTHENTICATION_FAILED');assert.ok(h.events.some(e=>e.event==='startup_cleanup_failure'));assert.deepEqual(h.delays,[]);
});
test('HTTP module failure is reported separately without retrying database setup',async()=>{
 const h=harness();h.deps.start=async()=>{throw failure('EADDRINUSE');};await assert.rejects(()=>runStartup(h.deps),e=>e instanceof StartupFailure&&e.stage==='http-server');assert.equal(h.counts().prepares,1);assert.ok(!JSON.stringify(h.events).includes(secret));
});
test('malformed password encoding produces a safe configuration failure',()=>{
 assert.throws(()=>databaseOptions({NODE_ENV:'production',DATABASE_URL:'postgres://owner:%@example.invalid/db'}),e=>e instanceof ConfigError&&e.variable==='DATABASE_URL');
});
