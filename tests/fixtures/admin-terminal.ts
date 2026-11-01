// PTY test fixture. It never opens a database, prints a credential, or creates an account.
import {promptAdminInput,adminErrorMessage} from '../../src/admin-terminal.ts';
let input;
try{input=await promptAdminInput(process.stdin,process.stdout,process.env.EE_TEST_VERIFY==='1'?'verify':'initialize');if(!input.databaseUrl||!input.email||!input.password)throw new Error('Missing collected field');console.log('[INPUT_ACCEPTED]');}
catch(error){console.error('[INPUT_REJECTED] '+adminErrorMessage(error));process.exitCode=1;}
finally{if(input){input.databaseUrl='';input.email='';input.password='';input.currentPassword='';}}
