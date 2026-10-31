import {loadConfig,databaseOptions} from '../src/config.ts';
let failed=false;
for(const validate of [loadConfig,databaseOptions])try{validate();}catch(error){failed=true;console.error((error as Error).message);}
if(failed)process.exitCode=1;else console.log('Environment configuration valid. No secret values printed.');
