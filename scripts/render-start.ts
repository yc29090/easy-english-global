import {database} from '../src/db.ts';
import {loadConfig} from '../src/config.ts';
import {runStartup} from '../src/startup.ts';
// Uses existing credentials. Only safe stages/codes are logged, never driver error text.
try{
 await runStartup({
  config:loadConfig,pool:database,
  prepare:async(client)=>{const {prepareDatabase}=await import('../src/setup.ts');return prepareDatabase(client);},
  start:()=>import('../src/server.ts'),
  log:event=>{const output=JSON.stringify(event);if(event.event==='startup_failure')console.error(output);else console.log(output);}
 });
}catch{process.exitCode=1;}
