import {ConfigError} from './config.ts';
import type {RuntimeConfig} from './config.ts';
import type {DB} from './db.ts';
export type StartupStage='configuration'|'database-options'|'database-connect'|'database-tls'|'database-prepare'|'database-close'|'http-server';
type Client=DB&{release:(destroy?:boolean)=>void;connection?:{stream?:unknown}};
type Pool={connect:()=>Promise<Client>;end:()=>Promise<unknown>;on?:(event:'error',listener:()=>void)=>unknown};
export type StartupEvent={event:'startup_phase'|'startup_failure'|'startup_retry'|'startup_cleanup_failure';stage:StartupStage;attempt:number;status?:'started'|'complete'|'verified';code?:string;sourceCode?:string;willRetry?:boolean;delayMs?:number;variable?:string;protocol?:string;alreadyInstalled?:boolean};
export type StartupDependencies={
 config:()=>RuntimeConfig;pool:()=>Pool;prepare:(client:DB)=>Promise<{alreadyInstalled:boolean}>;
 start:()=>Promise<unknown>;log:(event:StartupEvent)=>void;wait?:(ms:number)=>Promise<void>;
};
const transient=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','EHOSTUNREACH','ENETUNREACH','08000','08001','08003','08004','08006','08007','57P01','57P02','57P03','53300','57014']);
const tlsCodes=new Set(['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED']);
const authCodes=new Set(['28P01','28000']);
const knownCodes=new Set([...transient,...tlsCodes,...authCodes,'EADDRINUSE','EACCES']);
const variables=new Set(['NODE_ENV','PORT','APP_URL','ALLOW_MOCK_CHECKOUT','ADMIN_EMAIL','DATABASE_URL','DATABASE_SSL','DATABASE_CA_CERT','NODE_TLS_REJECT_UNAUTHORIZED','MAIL_PROVIDER','MAIL_FROM','RESEND_API_KEY','SMTP_HOST','SMTP_PORT','SMTP_USER']);
export class StartupFailure extends Error {
 stage:StartupStage;code:string;
 constructor(stage:StartupStage,code:string){super('Startup did not complete');this.stage=stage;this.code=code;}
}
function safeCode(error:unknown,depth=0):string|undefined{
 if(!error||typeof error!=='object'||depth>3)return;
 const e=error as {code?:unknown;cause?:unknown;errors?:unknown[]};
 if(typeof e.code==='string'&&knownCodes.has(e.code))return e.code;
 const nested=safeCode(e.cause,depth+1);if(nested)return nested;
 if(Array.isArray(e.errors))for(const item of e.errors){const result=safeCode(item,depth+1);if(result)return result;}
}
/** Never serializes error.message, stack, detail, cause, connection options or environment values. */
export function classifyStartupError(error:unknown,stage:StartupStage){
 const sourceCode=safeCode(error);
 if(error instanceof ConfigError){const name=error.variable.match(/^[A-Z_]+/)?.[0];return {code:'CONFIGURATION_INVALID',retryable:false,...name&&variables.has(name)?{variable:name}:{}};}
 if(sourceCode&&authCodes.has(sourceCode))return {code:'DB_AUTHENTICATION_FAILED',sourceCode,retryable:false};
 if(stage==='database-tls'||sourceCode&&tlsCodes.has(sourceCode))return {code:'DB_TLS_VERIFICATION_FAILED',...sourceCode?{sourceCode}:{},retryable:false};
 if(sourceCode&&transient.has(sourceCode)&&stage!=='http-server')return {code:'DB_TEMPORARILY_UNAVAILABLE',sourceCode,retryable:true};
 // node-postgres timeouts can have a fixed message without a driver code.
 if(error instanceof Error&&['Connection terminated due to connection timeout','timeout exceeded when trying to connect','Query read timeout','Connection terminated unexpectedly'].includes(error.message)&&['database-connect','database-prepare'].includes(stage))return {code:'DB_TEMPORARILY_UNAVAILABLE',retryable:true};
 if(stage==='database-prepare'&&error instanceof Error&&/^(Installed version differs|Scene conflict:|Material conflict:|Audio conflict:|Dialogue .*conflict:)/.test(error.message))return {code:'CURRICULUM_CONFLICT',retryable:false};
 return {code:stage==='database-options'?'DATABASE_OPTIONS_INVALID':stage==='database-prepare'?'DATABASE_PREPARATION_FAILED':stage==='http-server'?'HTTP_SERVER_START_FAILED':'DATABASE_START_FAILED',...sourceCode?{sourceCode}:{},retryable:false};
}
export async function runStartup(deps:StartupDependencies){
 const wait=deps.wait||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 let config:RuntimeConfig;
 deps.log({event:'startup_phase',stage:'configuration',attempt:1,status:'started'});
 try{config=deps.config();}catch(error){const info=classifyStartupError(error,'configuration');deps.log({event:'startup_failure',stage:'configuration',attempt:1,...info,willRetry:false});throw new StartupFailure('configuration',info.code);}
 for(let attempt=1;attempt<=4;attempt++){
  let stage:StartupStage='database-options',pool:Pool|undefined,client:Client|undefined;
  let failure:{stage:StartupStage;error:unknown}|undefined;
  try{
   deps.log({event:'startup_phase',stage,attempt,status:'started'});pool=deps.pool();
   pool.on?.('error',()=>deps.log({event:'startup_cleanup_failure',stage:'database-close',attempt,code:'IDLE_DATABASE_CONNECTION_FAILED'}));
   stage='database-connect';deps.log({event:'startup_phase',stage,attempt,status:'started'});client=await pool.connect();
   stage='database-tls';
   if(config.production){
    const stream=client.connection?.stream as {encrypted?:boolean;authorized?:boolean;getProtocol?:()=>string|null}|undefined;
    if(!stream?.encrypted||stream.authorized!==true)throw new Error('TLS verification is required');
    const protocol=stream.getProtocol?.();deps.log({event:'startup_phase',stage,attempt,status:'verified',...protocol&&['TLSv1.2','TLSv1.3'].includes(protocol)?{protocol}:{}});
   }
   stage='database-prepare';deps.log({event:'startup_phase',stage,attempt,status:'started'});
   const result=await deps.prepare(client);deps.log({event:'startup_phase',stage,attempt,status:'complete',alreadyInstalled:result.alreadyInstalled});
  }catch(error){failure={stage,error};}
  finally{
   try{client?.release(!!failure);}catch(error){if(!failure)failure={stage:'database-close',error};}
   try{await pool?.end();}catch(error){if(!failure)failure={stage:'database-close',error};else deps.log({event:'startup_cleanup_failure',stage:'database-close',attempt,code:'DATABASE_POOL_CLOSE_FAILED'});}
  }
  if(!failure)break;
  const info=classifyStartupError(failure.error,failure.stage),willRetry=info.retryable&&attempt<4;
  deps.log({event:'startup_failure',stage:failure.stage,attempt,...info,willRetry});
  if(!willRetry)throw new StartupFailure(failure.stage,info.code);
  const delayMs=1000*2**attempt;deps.log({event:'startup_retry',stage:failure.stage,attempt,delayMs});await wait(delayMs);
 }
 deps.log({event:'startup_phase',stage:'http-server',attempt:1,status:'started'});
 try{await deps.start();}catch(error){const info=classifyStartupError(error,'http-server');deps.log({event:'startup_failure',stage:'http-server',attempt:1,...info,willRetry:false});throw new StartupFailure('http-server',info.code);}
}
