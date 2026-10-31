import {randomUUID} from 'node:crypto';
import type {DB} from './db.ts';
import {token,digest,hashPassword,verifyPassword,member,publicUser,HttpError,requireValue,email,password,days} from './security.ts';
export type Context={db:DB;method:string;path:string;body:any;session?:string;ip:string;sendReset:(email:string,url:string)=>Promise<void>;appUrl:string;mock:boolean};
export async function api(c:Context):Promise<any>{
 const {db,method,path,body:b}=c;
 const one=async(sql:string,v:any[]=[])=> (await db.query(sql,v)).rows[0];
 const transaction=async(fn:()=>Promise<any>)=>{await db.query('BEGIN');try{const result=await fn();await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}};
 async function limit(scope:string,max:number){const key=digest(scope+':'+c.ip);const r=await one(`INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING hits`,[key]);if(r.hits>max)throw new HttpError(429,'Too many attempts. Try again later.');}
 const sessionUser=async()=>c.session?await one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled=false',[digest(c.session)]):null;
 const issueSession=async(u:any)=>{const raw=token();await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')",[digest(raw),u.id]);return {user:publicUser(u),session:raw};};
 if(method==='GET'&&path==='/api/catalog'){
  const u=await sessionUser();const full=u&&!u.must_change_password&&member(u);
  const counts=(await db.query('SELECT kind,count(*)::int AS count FROM materials GROUP BY kind')).rows;
  return {counts,scenes:(await db.query('SELECT * FROM scenes ORDER BY id')).rows,materials:(await db.query('SELECT * FROM materials WHERE is_free=true OR $1::boolean ORDER BY id',[!!full])).rows,locked:!full};
 }
 if(method==='POST'&&path==='/api/auth/register'){
  await limit('auth',20);const address=email(b.email), hash=await hashPassword(password(b.password));
  const u=await one('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING *',[randomUUID(),address,hash]);
  if(!u)throw new HttpError(409,'Account cannot be created with this email');return issueSession(u);
 }
 if(method==='POST'&&path==='/api/auth/login'){
  await limit('auth',20);const address=email(b.email);requireValue(typeof b.password==='string'&&b.password.length<=128);
  const u=await one('SELECT * FROM users WHERE email=$1',[address]);
  // Always run scrypt, including for unknown accounts.
  const valid=await verifyPassword(b.password,u?.password_hash||'00000000000000000000000000000000:'+ '00'.repeat(64));
  if(!u||!valid||u.disabled)throw new HttpError(401,'Invalid email or password');return issueSession(u);
 }
 if(method==='POST'&&path==='/api/auth/forgot'){
  await limit('reset',5);const address=email(b.email);const u=await one('SELECT * FROM users WHERE email=$1 AND disabled=false',[address]);
  if(u){const raw=token();await db.query("INSERT INTO password_resets VALUES($1,$2,now()+interval '30 minutes')",[digest(raw),u.id]);try{await c.sendReset(address,c.appUrl+'/?reset='+encodeURIComponent(raw));}catch{await db.query('DELETE FROM password_resets WHERE token_hash=$1',[digest(raw)]);}}
  return {message:'If the account exists, a reset link will be sent.'};
 }
 if(method==='POST'&&path==='/api/auth/reset'){
  await limit('reset',5);requireValue(typeof b.token==='string'&&b.token.length<=128);const hash=await hashPassword(password(b.password));
  return transaction(async()=>{const r=await one('DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id',[digest(b.token)]);if(!r)throw new HttpError(400,'Invalid or expired reset link');await db.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[hash,r.user_id]);await db.query('DELETE FROM sessions WHERE user_id=$1',[r.user_id]);await db.query('DELETE FROM password_resets WHERE user_id=$1',[r.user_id]);return {ok:true};});
 }
 const u=await sessionUser();if(!u)throw new HttpError(401,'Please sign in');
 if(method==='GET'&&path==='/api/me')return {user:publicUser(u)};
 if(method==='POST'&&path==='/api/auth/logout'){await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(c.session!)]);return {logout:true};}
 if(method==='POST'&&path==='/api/auth/password'){
  await limit('password',10);requireValue(typeof b.current==='string'&&b.current.length<=128);if(!await verifyPassword(b.current,u.password_hash))throw new HttpError(403,'Incorrect current password');const hash=await hashPassword(password(b.password));
  return transaction(async()=>{await db.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[hash,u.id]);await db.query('DELETE FROM sessions WHERE user_id=$1',[u.id]);await db.query('DELETE FROM password_resets WHERE user_id=$1',[u.id]);return {logout:true};});
 }
 if(u.must_change_password)throw new HttpError(403,'Change your temporary password first');
 if(method==='GET'&&path==='/api/progress')return {progress:(await db.query('SELECT * FROM progress WHERE user_id=$1',[u.id])).rows};
 if(method==='PUT'&&path==='/api/progress'){
  requireValue(typeof b.material_id==='string'&&['learned','unmastered','mastered','review'].includes(b.status));
  const material=await one('SELECT * FROM materials WHERE id=$1',[b.material_id]);if(!material)throw new HttpError(404,'Material not found');if(!material.is_free&&!member(u))throw new HttpError(403,'Membership required');
  await db.query('INSERT INTO progress(user_id,material_id,status) VALUES($1,$2,$3) ON CONFLICT(user_id,material_id) DO UPDATE SET status=$3,updated_at=now()',[u.id,b.material_id,b.status]);return {ok:true};
 }
 if(path==='/api/orders'&&method==='GET')return {orders:(await db.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC',[u.id])).rows};
 if(path==='/api/orders'&&method==='POST'){
  if(u.membership==='lifetime')throw new HttpError(409,'Already a lifetime member');
  return {order:await one("INSERT INTO orders(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) WHERE status='pending' DO UPDATE SET user_id=EXCLUDED.user_id RETURNING *",[randomUUID(),u.id])};
 }
 if(path==='/api/orders/confirm'&&method==='POST'){
  if(!c.mock)throw new HttpError(403,'Mock checkout is disabled');requireValue(typeof b.id==='string');
  return transaction(async()=>{const o=await one('SELECT * FROM orders WHERE id::text=$1 AND user_id=$2 FOR UPDATE',[b.id,u.id]);if(!o)throw new HttpError(404,'Order not found');await db.query("UPDATE orders SET status='mock_paid',paid_at=COALESCE(paid_at,now()) WHERE id=$1",[o.id]);await db.query("UPDATE users SET membership='lifetime',trial_until=NULL WHERE id=$1",[u.id]);return {ok:true};});
 }
 if(path.startsWith('/api/admin/')){
  if(u.role!=='admin')throw new HttpError(403,'Administrator access required');
  if(path==='/api/admin/users'&&method==='GET')return {users:(await db.query('SELECT id,email,role,membership,trial_until,disabled,must_change_password FROM users ORDER BY created_at DESC LIMIT 500')).rows};
  if(path==='/api/admin/trials'&&method==='POST'){
   const address=email(b.email),period=days(b.days),temporaryPassword=token().slice(0,20),hash=await hashPassword(temporaryPassword);
   return transaction(async()=>{const created=await one("INSERT INTO users(id,email,password_hash,membership,trial_until,must_change_password) VALUES($1,$2,$3,'trial',now()+$4*interval '1 day',true) ON CONFLICT(email) DO NOTHING RETURNING *",[randomUUID(),address,hash,period]);if(!created)throw new HttpError(409,'Email already exists');await db.query('INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),u.id,created.id,'create_trial']);return {user:publicUser(created),temporaryPassword};});
  }
  if(path==='/api/admin/users'&&method==='PATCH'){
   requireValue(typeof b.id==='string'&&['extend','disable','enable','lifetime'].includes(b.action));if(b.id===u.id)throw new HttpError(400,'Cannot modify your own admin account');const period=b.action==='extend'?days(b.days):0;
   return transaction(async()=>{const target=await one('SELECT * FROM users WHERE id::text=$1 FOR UPDATE',[b.id]);if(!target)throw new HttpError(404,'User not found');if(target.role==='admin')throw new HttpError(403,'Admin accounts are protected');if(b.action==='extend'){if(target.membership==='lifetime')throw new HttpError(409,'Already lifetime');await db.query("UPDATE users SET membership='trial',trial_until=GREATEST(COALESCE(trial_until,now()),now())+$1*interval '1 day' WHERE id=$2",[period,target.id]);}else if(b.action==='lifetime')await db.query("UPDATE users SET membership='lifetime',trial_until=NULL WHERE id=$1",[target.id]);else {await db.query('UPDATE users SET disabled=$1 WHERE id=$2',[b.action==='disable',target.id]);if(b.action==='disable')await db.query('DELETE FROM sessions WHERE user_id=$1',[target.id]);}await db.query('INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),u.id,target.id,b.action]);return {ok:true};});
  }
 }
 throw new HttpError(404,'Not found');
}
