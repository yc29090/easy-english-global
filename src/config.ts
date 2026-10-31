export type RuntimeConfig={production:boolean;appUrl:string;port:number;mockCheckout:boolean;mailProvider:'disabled'|'resend'|'smtp';mailFrom:string;resendKey?:string;smtp?:{host:string;port:number;user:string;pass:string}};
type Env=Record<string,string|undefined>;
export class ConfigError extends Error {
 variable:string;
 constructor(variable:string){super('Invalid or missing environment variable: '+variable);this.variable=variable;}
}
function fail(name:string):never{throw new ConfigError(name);}
export function canonicalOrigin(value:string|undefined,production:boolean):string{
 if(!value)fail('APP_URL (or Render RENDER_EXTERNAL_URL)');
 try{const url=new URL(value!);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(production&&url.protocol!=='https:'))fail('APP_URL');return url.origin;}catch{fail('APP_URL');}
}
export function loadConfig(env:Env=process.env):RuntimeConfig{
 if(env.NODE_ENV&&!['development','test','production'].includes(env.NODE_ENV))fail('NODE_ENV');
 const production=env.NODE_ENV==='production';
 if(production&&env.NODE_TLS_REJECT_UNAUTHORIZED==='0')fail('NODE_TLS_REJECT_UNAUTHORIZED (must not disable certificate verification)');
 if(env.RENDER==='true'&&!production)fail('NODE_ENV (Render requires production)');
 const port=Number(env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)fail('PORT');
 if(env.ALLOW_MOCK_CHECKOUT&&!['true','false'].includes(env.ALLOW_MOCK_CHECKOUT))fail('ALLOW_MOCK_CHECKOUT');
 if(production&&env.ALLOW_MOCK_CHECKOUT==='true')fail('ALLOW_MOCK_CHECKOUT (must be false in production)');
 if(production&&(env.ADMIN_EMAIL||env.ADMIN_PASSWORD))fail('ADMIN_EMAIL/ADMIN_PASSWORD (unsupported; remove from web service)');
 const appUrl=canonicalOrigin(env.APP_URL||env.RENDER_EXTERNAL_URL||(!production?'http://localhost:3000':undefined),production);
 const mailProvider=env.MAIL_PROVIDER||(!production?'disabled':'resend');
 if(!['disabled','resend','smtp'].includes(mailProvider))fail('MAIL_PROVIDER');
 const mailFrom=env.MAIL_FROM||'';
 if(mailProvider!=='disabled'&&(!mailFrom||/[\r\n]/.test(mailFrom)||!/@/.test(mailFrom)))fail('MAIL_FROM');
 if(mailProvider==='resend'&&(!env.RESEND_API_KEY||!/^[A-Za-z0-9_-]{10,}$/.test(env.RESEND_API_KEY)))fail('RESEND_API_KEY');
 let smtp:RuntimeConfig['smtp'];
 if(mailProvider==='smtp'){
  const smtpPort=Number(env.SMTP_PORT||587);
  if(!env.SMTP_HOST||/[\s/]/.test(env.SMTP_HOST))fail('SMTP_HOST');
  if(!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535)fail('SMTP_PORT');
  if(!env.SMTP_USER||!env.SMTP_PASS)fail('SMTP_USER/SMTP_PASS');
  smtp={host:env.SMTP_HOST,port:smtpPort,user:env.SMTP_USER,pass:env.SMTP_PASS};
 }
 return {production,appUrl,port,mockCheckout:!production&&env.ALLOW_MOCK_CHECKOUT==='true',mailProvider:mailProvider as RuntimeConfig['mailProvider'],mailFrom,resendKey:env.RESEND_API_KEY,smtp};
}
export function databaseOptions(env:Env=process.env){
 const value=env.DATABASE_URL;if(!value)fail('DATABASE_URL');
 let url:URL;try{url=new URL(value!);}catch{fail('DATABASE_URL');}
 if(!['postgres:','postgresql:'].includes(url!.protocol)||!url!.hostname||url!.pathname.length<=1)fail('DATABASE_URL');
 const production=env.NODE_ENV==='production';
 if(production&&env.NODE_TLS_REJECT_UNAUTHORIZED==='0')fail('NODE_TLS_REJECT_UNAUTHORIZED (must not disable certificate verification)');
 let decodedPassword:string;try{decodedPassword=decodeURIComponent(url!.password);}catch{fail('DATABASE_URL');}
 if(production&&(!url!.username||!url!.password||/local-development-only|changeme|password$|^postgres$/i.test(decodedPassword!)))fail('DATABASE_URL (unique database credentials required)');
 const requested=env.DATABASE_SSL||url!.searchParams.get('sslmode')||(production?'verify-full':'disable');
 if(!['disable','require','verify-ca','verify-full'].includes(requested))fail('DATABASE_SSL');
 if(production&&requested==='disable')fail('DATABASE_SSL (TLS is required in production)');
 // Remove libpq flags: pg must never override certificate verification with sslmode=require.
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat'])url!.searchParams.delete(key);
 return {connectionString:url!.toString(),max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,query_timeout:10000,statement_timeout:10000,application_name:'easy-english',ssl:requested==='disable'?false as const:{rejectUnauthorized:true,...(env.DATABASE_CA_CERT?{ca:env.DATABASE_CA_CERT}:{})}};
}
