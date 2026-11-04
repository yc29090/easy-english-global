import {database} from '../src/db.ts';
import {loadConfig} from '../src/config.ts';
import {runStartup} from '../src/startup.ts';
import {ogdenPublished,prepareOgdenPublication} from '../src/ogden-publication.ts';
// Uses existing credentials. Only safe stages/codes are logged, never driver error text.
try{
 let publish=false;
 await runStartup({
  config:()=>{const config=loadConfig();publish=ogdenPublished(process.env);return config;},pool:database,
  prepare:async(client)=>{const {prepareDatabase}=await import('../src/setup.ts');const result=await prepareDatabase(client);await prepareOgdenPublication(client,publish);return result;},
  start:()=>import('../src/server.ts'),
  log:event=>{const output=JSON.stringify(event);if(event.event==='startup_failure')console.error(output);else console.log(output);}
 });
}catch{process.exitCode=1;}
