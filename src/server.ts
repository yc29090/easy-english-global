import {database} from './db.ts';
import {loadConfig} from './config.ts';
import {createApplication} from './http.ts';
import {resetMailer} from './mail.ts';
const config=loadConfig(),pool=database();
pool.on('error',()=>console.error('Idle database connection failed'));
const server=createApplication(pool,config,resetMailer(config));
server.listen(config.port,'0.0.0.0',()=>console.log('Easy English listening on port '+config.port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 server.close(()=>{void pool.end();});
 setTimeout(()=>process.exit(1),10000).unref();
});
