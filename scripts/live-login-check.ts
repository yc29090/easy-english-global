// Creates only a dedicated QA user. No real user's password is requested or logged.
import {randomBytes} from 'node:crypto';
import {smoke} from '../src/smoke.ts';
const site=process.env.LIVE_BASE_URL,run=process.env.GITHUB_RUN_ID;
if(!site||!run)throw new Error('LIVE_BASE_URL and GITHUB_RUN_ID are required');
const origin=new URL(site).origin;
if(origin!=='https://easy-english-global.onrender.com')throw new Error('Unexpected public test site');
const email=`ee-repair-${run}@example.invalid`,password=randomBytes(24).toString('base64url');
let registrationCookie:string|undefined;
try{
 const response=await fetch(origin+'/api/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password}),redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error('Test registration failed');
 registrationCookie=response.headers.get('set-cookie')?.split(';')[0];
 const account=(await response.json()).user;if(account.role!=='user'||account.membership!=='free')throw new Error('Unexpected test-account permissions');
 const checks=await smoke(origin,{email,password});for(const check of checks)console.log('PASS '+check);
 console.log('PUBLIC_LOGIN_CHECK_COMPLETE '+checks.length+' checks passed; dedicated QA account requires disabling after verification');
}catch{console.error('Public login verification failed; no credentials are logged');process.exitCode=1;}
finally{
 if(registrationCookie)try{await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:registrationCookie},body:'{}',signal:AbortSignal.timeout(15000)});}catch{}
}
