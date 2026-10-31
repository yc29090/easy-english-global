import {smoke} from '../src/smoke.ts';
try{
 const base=process.argv[2]||process.env.APP_URL||process.env.RENDER_EXTERNAL_URL;if(!base)throw new Error('Usage: npm run smoke -- https://your-site.onrender.com');
 if(!!process.env.SMOKE_EMAIL!==!!process.env.SMOKE_PASSWORD)throw new Error('Provide both SMOKE_EMAIL and SMOKE_PASSWORD, or neither');
 const credentials=process.env.SMOKE_EMAIL?{email:process.env.SMOKE_EMAIL,password:process.env.SMOKE_PASSWORD!}:undefined;
 const checks=await smoke(base,credentials);for(const check of checks)console.log('PASS '+check);console.log(checks.length+' deployment checks passed');
}catch{console.error('Deployment checks failed. Confirm the site URL, service readiness, test-account credentials and Render logs. No credentials are logged.');process.exitCode=1;}
