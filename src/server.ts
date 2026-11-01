import {database} from './db.ts';
import {loadConfig} from './config.ts';
import {createApplication} from './http.ts';
import {resetMailer,orderMailer} from './mail.ts';
import {mailAcceptance} from './mail-acceptance.ts';
const config=loadConfig(),pool=database();
pool.on('error',()=>console.error('Idle database connection failed'));
const server=createApplication(pool,config,resetMailer(config),orderMailer(config));
server.listen(config.port,'0.0.0.0',()=>{
 console.log('Easy English listening on port '+config.port);
 const testId=process.env.MAIL_ACCEPTANCE_TEST_ID;
 if(testId)void (async()=>{
  const client=await pool.connect();
  try{const result=await mailAcceptance(client,config,testId);console.log(JSON.stringify({event:'mail_acceptance',testId,...result}));}
  finally{client.release();}
 })().catch(()=>console.error(JSON.stringify({event:'mail_acceptance',status:'test_unavailable'})));
});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 server.close(()=>{void pool.end();});
 setTimeout(()=>process.exit(1),10000).unref();
});
