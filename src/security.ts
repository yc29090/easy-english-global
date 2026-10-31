import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const token=()=>randomBytes(32).toString('base64url');
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64) as Buffer).toString('hex');}
export async function verifyPassword(password:string,hash:string){const [salt,key]=hash.split(':');if(!salt||!key)return false;const actual=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export function member(user:any, now=Date.now()){return user.membership==='lifetime'||(user.membership==='trial'&&new Date(user.trial_until).getTime()>now);}
export function publicUser(u:any){return {id:u.id,email:u.email,role:u.role,membership:u.membership,trial_until:u.trial_until,must_change_password:u.must_change_password,disabled:u.disabled,hasAccess:member(u)};}
export class HttpError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export function requireValue(ok:unknown,message='Invalid input'):asserts ok {if(!ok)throw new HttpError(400,message);}
export function email(value:unknown){requireValue(typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),'Invalid email');return value.toLowerCase().trim();}
export function password(value:unknown){requireValue(typeof value==='string'&&value.length>=12&&value.length<=128,'Password must contain 12–128 characters');return value;}
export function days(value:unknown){requireValue(Number.isInteger(value)&&Number(value)>=1&&Number(value)<=90,'Trial days must be 1–90');return Number(value);}
