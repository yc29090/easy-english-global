import {readFile} from 'node:fs/promises';
import {database} from '../src/db.ts';
const db=database();try{await db.query(await readFile(new URL('../db/001_init.sql',import.meta.url),'utf8'));console.log('Database ready');}finally{await db.end();}
