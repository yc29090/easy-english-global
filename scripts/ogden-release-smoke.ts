import {releaseSmoke} from '../src/ogden-release-smoke.ts';
// Only run against production after a separately authorized deploy. No env-file loading or secret output.
try{
 const args=process.argv.slice(2);if(args.length!==3||!['closed','open'].includes(args[1])||!['true','false'].includes(args[2]))throw Error('Invalid arguments');
 const {SMOKE_EMAIL:email,SMOKE_PASSWORD:password,SMOKE_ACCESS:access}=process.env;
 if(!!email!==!!password||email&&!['allowed','denied'].includes(access||'')||!email&&access)throw Error('Invalid test credentials');
 const report=await releaseSmoke(args[0],{expect:args[1] as 'closed'|'open',manualPayment:args[2]==='true',credentials:email?{email,password:password!,access:access as 'allowed'|'denied'}:undefined});
 console.log(JSON.stringify(report,null,2));
}catch{console.error('Release smoke did not pass. Usage: node scripts/ogden-release-smoke.ts HTTPS_ORIGIN closed|open EXPECTED_MANUAL_PAYMENT_TRUE_OR_FALSE. Optional authorized test account: SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_ACCESS=allowed|denied. Credentials and server error details are never logged.');process.exitCode=1;}
