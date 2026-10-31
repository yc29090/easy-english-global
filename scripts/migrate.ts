import {database} from '../src/db.ts';
import {migrate} from '../src/migrations.ts';
const pool=database();const client=await pool.connect();
try{await migrate(client);console.log('Database ready; existing data preserved');}finally{client.release();await pool.end();}
