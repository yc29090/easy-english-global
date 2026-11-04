import {expressionCoverage,OGDEN_PATH} from './ogden-coverage.ts';
import {OGDEN_DOMAINS} from './ogden-content.ts';
import {ogdenEntitlement} from './ogden-policy.ts';
import type {DB} from './db.ts';
import {HttpError,requireValue} from './security.ts';
import {reviewSchedule} from './review.ts';
export async function ogden(c:{db:DB;userId:string;method:string;path:string;body:any;preview?:boolean;query?:URLSearchParams;user?:{membership:string;trial_until?:string}}):Promise<any>{
 const {db,userId,method,path,body:b}=c;
 const modes=['study','build','express','listening','speaking'];
 const query=c.query||new URLSearchParams(),preview=c.preview!==false;
 const active=preview?"i.review_status<>'retired'":"i.review_status='approved'";
 const visiblePayload="jsonb_set(i.payload,'{reviewStatus}',to_jsonb(i.review_status))";
 const validTarget=preview?"review_status<>'retired'":"review_status='approved'";
 if(method==='GET'&&path==='/api/ogden/catalog'){const items=(await db.query(`SELECT ${visiblePayload} AS payload FROM ogden_items i WHERE ${active} AND (i.kind<>'operator' OR EXISTS(SELECT 1 FROM ogden_items w WHERE w.id=i.payload->>'wordId' AND ${preview?"w.review_status<>'retired'":"w.review_status='approved'"})) ORDER BY i.kind,(i.payload->>'order')::int,i.id`)).rows.map(r=>r.payload);return {release:'draft-preview',policy:'existing-members-both-versions',entitlement:ogdenEntitlement(c.user||{membership:'free'}),preview,domains:OGDEN_DOMAINS,items,coverage:expressionCoverage(items),learningPath:OGDEN_PATH};}
 if(method==='GET'&&path==='/api/ogden/progress')return {ownerId:userId,progress:(await db.query('SELECT * FROM ogden_progress WHERE user_id=$1 ORDER BY updated_at DESC,item_id',[userId])).rows,practice:(await db.query('SELECT item_id,mode,status,next_review_at,attempts FROM ogden_practice_progress WHERE user_id=$1 ORDER BY item_id,mode',[userId])).rows};
 if(method==='GET'&&path==='/api/ogden/review'){
  const mode=query.get('mode')||'all',kind=query.get('kind')||'all',all=query.get('all')==='true',status=query.get('status')||'all';
  requireValue(['all','unmastered','review'].includes(status)&&['all',...modes].includes(mode)&&['all','word','operator','pattern','combination','expression'].includes(kind),'Invalid review filter');
  requireValue(query.get('all')===null||['true','false'].includes(query.get('all')!),'Invalid review filter');
  if(mode!=='all')return {items:(await db.query(`SELECT ${visiblePayload} AS payload,p.status,p.next_review_at,p.mode FROM ogden_practice_progress p JOIN ogden_items i ON i.id=p.item_id WHERE p.user_id=$1 AND p.mode=$2 AND ${active} AND ($3='all' OR i.kind=$3 OR ($3='operator' AND EXISTS(SELECT 1 FROM ogden_items o WHERE o.kind='operator' AND ${preview?"o.review_status<>'retired'":"o.review_status='approved'"} AND o.payload->>'wordId'=i.id))) AND ($5='all' OR p.status=$5) AND ($4::boolean OR p.status IN ('unmastered','review') OR p.next_review_at<=now()) ORDER BY CASE p.status WHEN 'unmastered' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,p.next_review_at,i.id`,[userId,mode,kind,all,status])).rows};
  return {items:(await db.query(`SELECT ${visiblePayload} AS payload,p.status,p.next_review_at,
   ARRAY(SELECT m.mode FROM ogden_practice_progress m WHERE m.user_id=p.user_id AND m.item_id=p.item_id AND (m.status IN ('unmastered','review') OR m.next_review_at<=now()) ORDER BY m.mode) AS review_modes
   FROM ogden_progress p JOIN ogden_items i ON i.id=p.item_id WHERE p.user_id=$1 AND ${active} AND ($2='all' OR i.kind=$2 OR ($2='operator' AND EXISTS(SELECT 1 FROM ogden_items o WHERE o.kind='operator' AND ${preview?"o.review_status<>'retired'":"o.review_status='approved'"} AND o.payload->>'wordId'=i.id)))
   AND ($4='all' OR p.status=$4 OR EXISTS(SELECT 1 FROM ogden_practice_progress s WHERE s.user_id=p.user_id AND s.item_id=p.item_id AND s.status=$4))
   AND ($3::boolean OR p.status IN ('unmastered','review') OR p.next_review_at<=now() OR EXISTS(SELECT 1 FROM ogden_practice_progress m WHERE m.user_id=p.user_id AND m.item_id=p.item_id AND (m.status IN ('unmastered','review') OR m.next_review_at<=now())))
   ORDER BY CASE WHEN p.status='unmastered' OR EXISTS(SELECT 1 FROM ogden_practice_progress m WHERE m.user_id=p.user_id AND m.item_id=p.item_id AND m.status='unmastered') THEN 0 ELSE 1 END,p.next_review_at,i.id`,[userId,kind,all,status])).rows};
 }
 if(method==='GET'&&path==='/api/ogden/analytics'){
  const shared=(await db.query(`SELECT i.kind,count(*)::int AS studied,count(*) FILTER(WHERE p.status='mastered')::int AS mastered FROM ogden_progress p JOIN ogden_items i ON i.id=p.item_id WHERE p.user_id=$1 AND ${active} GROUP BY i.kind ORDER BY i.kind`,[userId])).rows;
  const practice=(await db.query(`SELECT p.mode,count(*)::int AS practiced,sum(p.attempts)::int AS attempts,count(*) FILTER(WHERE p.status='unmastered')::int AS weak,count(*) FILTER(WHERE p.next_review_at<=now() OR p.status IN ('unmastered','review'))::int AS due FROM ogden_practice_progress p JOIN ogden_items i ON i.id=p.item_id WHERE p.user_id=$1 AND ${active} GROUP BY p.mode ORDER BY p.mode`,[userId])).rows;
  const recent=(await db.query(`SELECT e.item_id,e.mode,e.status,e.created_at FROM ogden_practice_events e JOIN ogden_items i ON i.id=e.item_id WHERE e.user_id=$1 AND ${active} ORDER BY e.created_at DESC,e.request_id DESC LIMIT 10`,[userId])).rows;
  return {shared,practice,recent};
 }
 if(method==='POST'&&path==='/api/ogden/results'){
  requireValue(!('user_id' in b),'User comes from the session');
  requireValue(b.item_version===undefined||(Number.isInteger(b.item_version)&&b.item_version>0&&b.item_version<=2147483647),'Invalid material version');
  requireValue(typeof b.item_id==='string'&&b.item_id.length<=120&&['study','build','express','listening','speaking'].includes(b.mode)&&['learned','mastered','unmastered','review'].includes(b.status)&&typeof b.request_id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(b.request_id),'Invalid Ogden result');
  await db.query('BEGIN');
  try{
   await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
   let item=(await db.query(`SELECT * FROM ogden_items WHERE id=$1`,[b.item_id])).rows[0];if(!item)throw new HttpError(404,'教材不存在');
   if(item.kind==='operator')item=(await db.query(`SELECT * FROM ogden_items WHERE id=$1`,[item.payload.wordId])).rows[0];
   if(!item)throw new HttpError(404,'教材不存在');
   requireValue(b.mode!=='build'||item.kind==='combination');requireValue(b.mode!=='express'||item.kind==='expression');
   const prior=(await db.query('SELECT * FROM ogden_practice_events WHERE user_id=$1 AND request_id=$2',[userId,b.request_id])).rows[0];
   if(prior){if(prior.item_id!==item.id||prior.mode!==b.mode||prior.status!==b.status||(b.item_version!==undefined&&prior.item_version!==b.item_version))throw new HttpError(409,'请求编号已使用');await db.query('COMMIT');return {ok:true,duplicate:true};}
   const activeItem=(await db.query(`SELECT id FROM ogden_items WHERE id=$1 AND ${validTarget}`,[b.item_id])).rows[0];
   const activeWord=(await db.query(`SELECT id FROM ogden_items WHERE id=$1 AND ${validTarget}`,[item.id])).rows[0];
   if(!activeItem||!activeWord)throw new HttpError(404,'教材不存在');
   const version=b.item_version??item.version;
   if(b.item_version!==undefined){const historical=(await db.query('SELECT payload FROM ogden_item_versions WHERE item_id=$1 AND version=$2',[item.id,version])).rows[0];if(!historical||(!preview&&historical.payload.reviewStatus!=='approved'))throw new HttpError(404,'教材版本不存在');}
   const old=(await db.query('SELECT mastery_streak FROM ogden_progress WHERE user_id=$1 AND item_id=$2',[userId,item.id])).rows[0];
   const schedule=reviewSchedule(b.status,old?.mastery_streak||0);
   const oldMode=(await db.query('SELECT mastery_streak FROM ogden_practice_progress WHERE user_id=$1 AND item_id=$2 AND mode=$3',[userId,item.id,b.mode])).rows[0];
   const modeSchedule=reviewSchedule(b.status,oldMode?.mastery_streak||0);
   await db.query('INSERT INTO ogden_practice_events(user_id,request_id,item_id,item_version,mode,status) VALUES($1,$2,$3,$4,$5,$6)',[userId,b.request_id,item.id,version,b.mode,b.status]);
   await db.query(`INSERT INTO ogden_progress(user_id,item_id,status,mastery_streak,next_review_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,item_id) DO UPDATE SET status=EXCLUDED.status,mastery_streak=EXCLUDED.mastery_streak,next_review_at=EXCLUDED.next_review_at,updated_at=now()`,[userId,item.id,b.status,schedule.masteryStreak,schedule.nextReviewAt]);
   await db.query(`INSERT INTO ogden_practice_progress(user_id,item_id,mode,status,mastery_streak,next_review_at,attempts) VALUES($1,$2,$3,$4,$5,$6,1) ON CONFLICT(user_id,item_id,mode) DO UPDATE SET status=EXCLUDED.status,mastery_streak=EXCLUDED.mastery_streak,next_review_at=EXCLUDED.next_review_at,attempts=ogden_practice_progress.attempts+1,updated_at=now()`,[userId,item.id,b.mode,b.status,modeSchedule.masteryStreak,modeSchedule.nextReviewAt]);
   await db.query('COMMIT');return {ok:true,next_review_at:schedule.nextReviewAt,mode_next_review_at:modeSchedule.nextReviewAt};
  }catch(e){await db.query('ROLLBACK');throw e;}
 }
 throw new HttpError(404,'Ogden endpoint not found');
}
