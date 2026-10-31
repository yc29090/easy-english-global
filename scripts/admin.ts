import {randomUUID} from 'node:crypto';
import {database} from '../src/db.ts';
import {email,password,hashPassword} from '../src/security.ts';
// Provide credentials through environment, never command-line arguments.
const address=email(process.env.ADMIN_EMAIL),hash=await hashPassword(password(process.env.ADMIN_PASSWORD));
const db=database();try{await db.query("INSERT INTO users(id,email,password_hash,role,membership) VALUES($1,$2,$3,'admin','lifetime')",[randomUUID(),address,hash]);console.log('Administrator created');}finally{await db.end();}
