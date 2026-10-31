import {database} from '../src/db.ts';
import {loadConfig} from '../src/config.ts';
import {prepareDatabase} from '../src/setup.ts';
// Free Render services do not require a shell or a paid pre-deploy command.
try{
 const config=loadConfig();
 const pool=database();
 try{const client=await pool.connect();try{
  if(config.production){
   const stream=(client as unknown as {connection:{stream:import('node:tls').TLSSocket}}).connection.stream;
   if(!stream.encrypted||!stream.authorized)throw new Error('Database TLS certificate verification failed');
   console.log('Database TLS verified: '+stream.getProtocol());
  }
  const result=await prepareDatabase(client);console.log(result.alreadyInstalled?'Database and curriculum ready':'Database migrations and curriculum installed');}finally{client.release();}}finally{await pool.end();}
 await import('../src/server.ts');
}catch(error){if(error instanceof Error&&error.message.startsWith('Invalid or missing environment variable:'))console.error(error.message);console.error('Startup failed. Check environment variables, database access, migration/import conflicts and deployment documentation. No secret values are logged.');process.exitCode=1;}
