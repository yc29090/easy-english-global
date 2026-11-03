import {readFile} from 'node:fs/promises';
import {database} from '../src/db.ts';
import {installLearningV2} from '../src/install-learning-v2.ts';
import {installContent} from '../src/install-content.ts';
const path=process.argv[2]||new URL('../data/curriculum.json',import.meta.url);
const data=JSON.parse(await readFile(path,'utf8')),pool=database(),client=await pool.connect();
try{console.log(JSON.stringify(await installContent(client,data),null,2));await installLearningV2(client);}finally{client.release();await pool.end();}
