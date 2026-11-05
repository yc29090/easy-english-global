import {ogden} from './ogden.ts';
import {learningV2} from './learning-v2.ts';
import {gmailAdmin,type GmailConfig} from './gmail.ts';
import {randomUUID} from 'node:crypto';
import type {DB} from './db.ts';
import {reviewSchedule} from './review.ts';
import {dialogues} from './dialogues.ts';
import {token,digest,hashPassword,verifyPassword,member,publicUser,HttpError,requireValue,email,password,days} from './security.ts';
export type Context={db:DB;ogdenPreview?:boolean;gmailConfig?:GmailConfig;query?:URLSearchParams;method:string;path:string;body:any;session?:string;ip:string;sendReset:(email:string,url:string)=>Promise<void>;appUrl:string;mock:boolean;manualPayment?:boolean;passwordResetEnabled?:boolean;onMailError?:()=>void;notifyOrder?:(order:{id:string;email:string;method:string})=>Promise<void>};
export async function api(c:Context):Promise<any>{
 const {db,method,path,body:b}=c;
 const one=async(sql:string,v:any[]=[])=> (await db.query(sql,v)).rows[0];
 const transaction=async(fn:()=>Promise<any>)=>{await db.query('BEGIN');try{const result=await fn();await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}};
 async function limit(scope:string,max:number){const key=digest(scope+':'+c.ip);const r=await one(`INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING hits`,[key]);if(r.hits>max)throw new HttpError(429,'Too many attempts. Try again later.');}
 // Persist a claim before attempting mail. A lease permits recovery after process death.
 async function deliverNotification(id:string){
  const job=await one("UPDATE order_notifications SET status='sending',attempts=attempts+1,updated_at=now() WHERE order_id=$1 AND (status IN ('pending','failed') OR (status='sending' AND updated_at<now()-interval '2 minutes')) RETURNING order_id",[id]);
  if(!job)return 'unchanged';
  try{
   if(!c.notifyOrder)throw new Error('Notifications unavailable');
   const order=await one('SELECT o.id,u.email,o.payment_method AS method FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=$1',[id]);
   await c.notifyOrder(order);
   await db.query("UPDATE order_notifications SET status='sent',updated_at=now() WHERE order_id=$1",[id]);
   return 'sent';
  }catch{
   await db.query("UPDATE order_notifications SET status='failed',updated_at=now() WHERE order_id=$1",[id]);
   c.onMailError?.();return 'failed';
  }
 }
 const sessionUser=async()=>c.session?await one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled=false',[digest(c.session)]):null;
 const issueSession=async(u:any)=>{const raw=token();await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')",[digest(raw),u.id]);return {user:publicUser(u),session:raw};};
 if(method==='GET'&&path==='/api/catalog'){
  const u=await sessionUser();const full=u&&!u.must_change_password&&member(u);
  const counts=(await db.query('SELECT kind,count(*)::int AS count FROM materials GROUP BY kind')).rows;
  const curriculumDialogues=(await db.query('SELECT * FROM curriculum_dialogues WHERE is_free=true OR $1::boolean ORDER BY difficulty,sort_order,id',[!!full])).rows;
  const dialogueCounts=(await db.query('SELECT scene_id,count(*)::int AS count FROM curriculum_dialogues GROUP BY scene_id')).rows;
  return {features:{manualPayment:c.manualPayment===true,mockCheckout:c.mock,passwordReset:c.passwordResetEnabled!==false},dialogues:[...curriculumDialogues,...dialogues],dialogueCounts,counts,scenes:(await db.query('SELECT * FROM scenes ORDER BY difficulty,sort_order,id')).rows,materials:(await db.query(`SELECT * FROM materials WHERE is_free=true OR $1::boolean ORDER BY CASE kind WHEN 'word' THEN 0 ELSE 1 END,difficulty,sort_order,id`,[!!full])).rows,locked:!full};
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
  if(c.passwordResetEnabled===false)throw new HttpError(503,'Password reset is temporarily unavailable');
  await limit('reset',5);const address=email(b.email);const u=await one('SELECT * FROM users WHERE email=$1 AND disabled=false',[address]);
  if(u){const raw=token();await db.query("INSERT INTO password_resets VALUES($1,$2,now()+interval '30 minutes')",[digest(raw),u.id]);try{await c.sendReset(address,c.appUrl+'/?reset='+encodeURIComponent(raw));}catch{c.onMailError?.();await db.query('DELETE FROM password_resets WHERE token_hash=$1',[digest(raw)]);}}
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
 if(path.startsWith('/api/ogden/')){if(c.ogdenPreview!==true&&!member(u))throw new HttpError(403,'现有会员可使用2.0，无额外收费');return ogden({db,userId:u.id,method,path,body:b,user:u,query:c.query,preview:c.ogdenPreview===true});}
 if(path.startsWith('/api/learning-v2/'))return learningV2({db,user:u,method,path,body:b,query:c.query||new URLSearchParams()});
 if(method==='GET'&&path==='/api/progress')return {progress:(await db.query('SELECT * FROM progress WHERE user_id=$1',[u.id])).rows};
 if(method==='PUT'&&path==='/api/progress'){
  requireValue(typeof b.material_id==='string'&&['learned','unmastered','mastered','review'].includes(b.status));
  const material=await one('SELECT * FROM materials WHERE id=$1',[b.material_id]);if(!material)throw new HttpError(404,'Material not found');if(!material.is_free&&!member(u))throw new HttpError(403,'Membership required');
  return transaction(async()=>{
   // Serialize updates per learner so concurrent devices cannot lose mastery steps.
   await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
   const old=await one('SELECT mastery_streak FROM progress WHERE user_id=$1 AND material_id=$2',[u.id,b.material_id]);
   const schedule=reviewSchedule(b.status,old?.mastery_streak||0);
   await db.query(`INSERT INTO progress(user_id,material_id,status,next_review_at,mastery_streak) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id,material_id) DO UPDATE SET status=$3,next_review_at=$4,mastery_streak=$5,updated_at=now()`,[u.id,b.material_id,b.status,schedule.nextReviewAt,schedule.masteryStreak]);
   await db.query(`INSERT INTO learning_state(user_id,last_material_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET last_material_id=$2,updated_at=now()`,[u.id,b.material_id]);
   return {ok:true,next_review_at:schedule.nextReviewAt};
  });
 }
 if(method==='GET'&&(path==='/api/review'||path==='/api/review/all')){
  const full=member(u);
  const items=(await db.query(`SELECT m.*,p.status,p.next_review_at FROM progress p JOIN materials m ON m.id=p.material_id
   WHERE p.user_id=$1 AND (m.is_free=true OR $2::boolean) AND ($3::boolean OR p.next_review_at<=now())
   ORDER BY CASE p.status WHEN 'unmastered' THEN 0 WHEN 'review' THEN 1 WHEN 'learned' THEN 2 ELSE 3 END,p.next_review_at,m.id`,[u.id,full,path.endsWith('/all')])).rows;
  return {items};
 }
 if(method==='GET'&&path==='/api/learning-state'){
  const state=await one('SELECT * FROM learning_state WHERE user_id=$1',[u.id]);
  return {state:state||null};
 }
 if(method==='PUT'&&path==='/api/learning-state'){
  requireValue(typeof b.material_id==='string');
  const m=await one('SELECT * FROM materials WHERE id=$1',[b.material_id]);
  if(!m)throw new HttpError(404,'Material not found');
  if(!m.is_free&&!member(u))throw new HttpError(403,'Membership required');
  await db.query(`INSERT INTO learning_state(user_id,last_material_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET last_material_id=$2,updated_at=now()`,[u.id,m.id]);return {ok:true};
 }
 if(method==='GET'&&path==='/api/practice-progress')return {practice:(await db.query('SELECT * FROM practice_progress WHERE user_id=$1',[u.id])).rows};
 if(method==='PUT'&&path==='/api/practice-progress'){
  requireValue(typeof b.dialogue_id==='string');
  const stored=await one('SELECT * FROM curriculum_dialogues WHERE id=$1',[b.dialogue_id]);
  if(stored&&!stored.is_free&&!member(u))throw new HttpError(403,'Membership required');
  const d=stored||dialogues.find(d=>d.id===b.dialogue_id);
  requireValue(d&&['a','b'].includes(b.role)&&Number.isInteger(b.turn_index)&&b.turn_index>=0&&b.turn_index<=d.turns.length,'Invalid dialogue progress');
  await db.query(`INSERT INTO practice_progress(user_id,dialogue_id,role,turn_index,completed_count) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(user_id,dialogue_id) DO UPDATE SET role=$3,turn_index=$4,
   completed_count=practice_progress.completed_count+CASE WHEN practice_progress.turn_index<$6 AND $4=$6 THEN 1 ELSE 0 END,updated_at=now()`,
   [u.id,d.id,b.role,b.turn_index,b.turn_index===d.turns.length?1:0,d.turns.length]);
  return {ok:true};
 }
 if(path==='/api/orders'&&method==='GET')return {orders:(await db.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC',[u.id])).rows};
 if(path==='/api/orders'&&method==='POST'){
  if(!c.mock)throw new HttpError(403,'Online checkout is unavailable');
  if(u.membership==='lifetime')throw new HttpError(409,'Already a lifetime member');
  return {order:await one("INSERT INTO orders(id,user_id) VALUES($1,$2) ON CONFLICT(user_id) WHERE status='pending' AND payment_method IS NULL DO UPDATE SET user_id=EXCLUDED.user_id RETURNING *",[randomUUID(),u.id])};
 }
 if(path==='/api/orders/confirm'&&method==='POST'){
  if(!c.mock)throw new HttpError(403,'Mock checkout is disabled');requireValue(typeof b.id==='string');
  return transaction(async()=>{const o=await one('SELECT * FROM orders WHERE id::text=$1 AND user_id=$2 FOR UPDATE',[b.id,u.id]);if(!o)throw new HttpError(404,'Order not found');if(o.payment_method||!['pending','mock_paid'].includes(o.status))throw new HttpError(409,'Not a mock order');await db.query("UPDATE orders SET status='mock_paid',paid_at=COALESCE(paid_at,now()) WHERE id=$1",[o.id]);await db.query("UPDATE users SET membership='lifetime',trial_until=NULL WHERE id=$1",[u.id]);return {ok:true};});
 }

 // Manual transfer: a customer's claim is not evidence of payment.
 if(path==='/api/orders/manual'&&method==='POST'){
  if(c.manualPayment!==true)throw new HttpError(503,'Manual payments are disabled');
  if(u.role==='admin')throw new HttpError(403,'Cannot create administrator payment orders');
  requireValue(['wechat','alipay'].includes(b.method));
  if(u.membership==='lifetime')throw new HttpError(409,'Already a lifetime member');
  await limit('manual-order',30);
  return transaction(async()=>{
   const current=await one('SELECT * FROM users WHERE id=$1 FOR UPDATE',[u.id]);
   if(!current||current.disabled||current.role==='admin')throw new HttpError(403,'Account unavailable');
   if(current.membership==='lifetime')throw new HttpError(409,'Already a lifetime member');
   const existing=await one("SELECT * FROM orders WHERE user_id=$1 AND payment_method IS NOT NULL AND status IN ('pending','payment_claimed') ORDER BY created_at DESC LIMIT 1",[u.id]);
   if(existing)return {order:existing};
   const order=await one("INSERT INTO orders(id,user_id,payment_method) VALUES($1,$2,$3) RETURNING *",[randomUUID(),u.id,b.method]);
   return {order};
  });
 }
 if(path==='/api/orders/manual/claim'&&method==='POST'){
  if(c.manualPayment!==true)throw new HttpError(503,'Manual payments are disabled');
  requireValue(typeof b.id==='string'&&/^[0-9a-f-]{36}$/i.test(b.id));
  await limit('manual-claim',20);
  const result=await transaction(async()=>{
   const order=await one('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[b.id,u.id]);
   if(!order)throw new HttpError(404,'Order not found');
   if(!order.payment_method)throw new HttpError(400,'Not a manual payment order');
   if(order.status==='payment_claimed')return {order,notify:false};
   if(order.status!=='pending')throw new HttpError(409,'Order cannot be claimed');
   const changed=await one("UPDATE orders SET status='payment_claimed',claimed_at=now() WHERE id=$1 RETURNING *",[order.id]);
   await db.query('INSERT INTO order_notifications(order_id) VALUES($1) ON CONFLICT DO NOTHING',[order.id]);
   return {order:changed,notify:true};
  });
  await deliverNotification(result.order.id);
  return {order:result.order};
 }
 if(path.startsWith('/api/admin/')){
  if(u.role!=='admin')throw new HttpError(403,'Administrator access required');

  if(path.startsWith('/api/admin/mail/gmail/')){
   if(method==='POST')await limit('gmail-admin',10);
   return gmailAdmin({db,config:c.gmailConfig,user:u,session:c.session!,method,path,query:c.query,appUrl:c.appUrl});
  }
  if(path==='/api/admin/orders/notify'&&method==='POST'){
   requireValue(typeof b.id==='string'&&/^[0-9a-f-]{36}$/i.test(b.id));
   await limit('order-notification-retry',20);
   return {notification:await deliverNotification(b.id)};
  }
  if(path==='/api/admin/orders'&&method==='GET'){
   return {orders:(await db.query("SELECT o.id,o.user_id,u.email,o.amount_fen,o.currency,o.status,o.payment_method,o.created_at,o.claimed_at,o.reviewed_at,n.status AS notification_status,n.attempts AS notification_attempts FROM orders o LEFT JOIN order_notifications n ON n.order_id=o.id JOIN users u ON u.id=o.user_id WHERE o.payment_method IS NOT NULL ORDER BY o.created_at DESC LIMIT 200")).rows};
  }
  if(path==='/api/admin/orders/review'&&method==='POST'){
   requireValue(typeof b.id==='string'&&/^[0-9a-f-]{36}$/i.test(b.id)&&['approve','reject'].includes(b.action));
   return transaction(async()=>{
    const o=await one('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[b.id]);
    if(!o||!o.payment_method)throw new HttpError(404,'Order not found');
    if(o.status==='paid'&&b.action==='approve')return {ok:true,alreadyReviewed:true};
    if(o.status==='rejected'&&b.action==='reject')return {ok:true,alreadyReviewed:true};
    if(o.status!=='payment_claimed')throw new HttpError(409,'Order is not awaiting verification');
    if(b.action==='approve'&&(c.manualPayment!==true||b.verified!==true))throw new HttpError(403,'Manual payments disabled or settlement not explicitly verified');
    const target=await one('SELECT * FROM users WHERE id=$1 FOR UPDATE',[o.user_id]);
    if(!target||target.disabled||target.role==='admin')throw new HttpError(403,'Cannot modify administrator membership');
    if(b.action==='approve'&&target.membership==='lifetime')throw new HttpError(409,'Already lifetime; check duplicate payment');
    const status=b.action==='approve'?'paid':'rejected';
    await db.query("UPDATE orders SET status=$1,reviewed_by=$2,reviewed_at=now(),paid_at=CASE WHEN $1='paid' THEN now() ELSE paid_at END WHERE id=$3",[status,u.id,o.id]);
    if(b.action==='approve')await db.query("UPDATE users SET membership='lifetime',trial_until=NULL WHERE id=$1",[o.user_id]);
    await db.query('INSERT INTO audit_log(id,actor_id,target_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),u.id,o.user_id,'manual_order_'+b.action+':'+o.id]);
    return {ok:true};
   });
  }
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
