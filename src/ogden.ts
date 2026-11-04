import {ogdenEntitlement} from './ogden-policy.ts';
import type {DB} from './db.ts';
import {HttpError,requireValue} from './security.ts';
import {reviewSchedule} from './review.ts';
export async function ogden(c:{db:DB;userId:string;method:string;path:string;body:any;user?:{membership:string;trial_until?:string}}):Promise<any>{
 const {db,userId,method,path,body:b}=c;
 if(method==='GET'&&path==='/api/ogden/catalog')return {release:'draft-preview',policy:'existing-members-both-versions',entitlement:ogdenEntitlement(c.user||{membership:'free'}),preview:true,items:(await db.query(`SELECT i.payload FROM ogden_items i WHERE i.review_status<>'retired' AND (i.kind<>'operator' OR EXISTS(SELECT 1 FROM ogden_items w WHERE w.id=i.payload->>'wordId' AND w.review_status<>'retired')) ORDER BY i.kind,(i.payload->>'order')::int,i.id`)).rows.map(r=>r.payload)};
 if(method==='GET'&&path==='/api/ogden/progress')return {progress:(await db.query('SELECT * FROM ogden_progress WHERE user_id=$1 ORDER BY updated_at DESC,item_id',[userId])).rows};
 if(method==='GET'&&path==='/api/ogden/review')return {items:(await db.query(`SELECT i.payload,p.status,p.next_review_at FROM ogden_progress p JOIN ogden_items i ON i.id=p.item_id WHERE p.user_id=$1 AND i.review_status<>'retired' AND (p.status IN ('unmastered','review') OR p.next_review_at<=now()) ORDER BY CASE p.status WHEN 'unmastered' THEN 0 ELSE 1 END,p.next_review_at,i.id`,[userId])).rows};
 if(method==='POST'&&path==='/api/ogden/results'){
  requireValue(!('user_id' in b),'User comes from the session');
  requireValue(typeof b.item_id==='string'&&b.item_id.length<=120&&['study','build','express','listening','speaking'].includes(b.mode)&&['learned','mastered','unmastered','review'].includes(b.status)&&typeof b.request_id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(b.request_id),'Invalid Ogden result');
  await db.query('BEGIN');
  try{
   await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
   let item=(await db.query('SELECT * FROM ogden_items WHERE id=$1 AND review_status<>\'retired\'',[b.item_id])).rows[0];if(!item)throw new HttpError(404,'教材不存在');
   if(item.kind==='operator')item=(await db.query("SELECT * FROM ogden_items WHERE id=$1 AND review_status<>'retired'",[item.payload.wordId])).rows[0];
   if(!item)throw new HttpError(404,'教材不存在');
   requireValue(b.mode!=='build'||item.kind==='combination');requireValue(b.mode!=='express'||item.kind==='expression');
   const prior=(await db.query('SELECT * FROM ogden_practice_events WHERE user_id=$1 AND request_id=$2',[userId,b.request_id])).rows[0];
   if(prior){if(prior.item_id!==item.id||prior.mode!==b.mode||prior.status!==b.status)throw new HttpError(409,'请求编号已使用');await db.query('COMMIT');return {ok:true,duplicate:true};}
   const old=(await db.query('SELECT mastery_streak FROM ogden_progress WHERE user_id=$1 AND item_id=$2',[userId,item.id])).rows[0];
   const schedule=reviewSchedule(b.status,old?.mastery_streak||0);
   await db.query('INSERT INTO ogden_practice_events(user_id,request_id,item_id,item_version,mode,status) VALUES($1,$2,$3,$4,$5,$6)',[userId,b.request_id,item.id,item.version,b.mode,b.status]);
   await db.query(`INSERT INTO ogden_progress(user_id,item_id,status,mastery_streak,next_review_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,item_id) DO UPDATE SET status=EXCLUDED.status,mastery_streak=EXCLUDED.mastery_streak,next_review_at=EXCLUDED.next_review_at,updated_at=now()`,[userId,item.id,b.status,schedule.masteryStreak,schedule.nextReviewAt]);
   await db.query('COMMIT');return {ok:true,next_review_at:schedule.nextReviewAt};
  }catch(e){await db.query('ROLLBACK');throw e;}
 }
 throw new HttpError(404,'Ogden endpoint not found');
}
