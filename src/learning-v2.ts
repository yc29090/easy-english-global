import {randomUUID} from 'node:crypto';
import type {DB} from './db.ts';
import {HttpError,requireValue,member} from './security.ts';
import {wordForms} from './learning-links.ts';
type User={id:string;membership:string;trial_until?:string;must_change_password?:boolean};
type Input={db:DB;user:User;method:string;path:string;body:any;query:URLSearchParams};
export async function learningV2(c:Input){
 const {db,user:u,method,path,body:b,query}=c,full=member(u),one=async(sql:string,v:any[]=[])=> (await db.query(sql,v)).rows[0];
 const material=async(id:unknown,pattern=false)=>{
  requireValue(typeof id==='string'&&id.length>0&&id.length<=150,'Invalid learning target');
  const m=await one(pattern?'SELECT * FROM learning_pattern_variants WHERE id=$1':'SELECT * FROM materials WHERE id=$1',[id]);
  if(!m)throw new HttpError(404,'Learning content not found');if(!m.is_free&&!full)throw new HttpError(403,'Membership required');return m;
 };
 if(method==='GET'&&path==='/api/learning-v2/links'){
  const source=await material(query.get('material_id'));
  const rows=(await db.query(`SELECT m.*,l.relation,p.status,p.next_review_at FROM learning_word_links l
   JOIN materials m ON m.id=CASE WHEN l.word_id=$1 THEN l.phrase_id ELSE l.word_id END
   LEFT JOIN progress p ON p.material_id=m.id AND p.user_id=$2
   WHERE (l.word_id=$1 OR l.phrase_id=$1) AND (m.is_free OR $3::boolean) ORDER BY m.sort_order,m.id`,[source.id,u.id,full])).rows;
  const dialogues=source.kind==='phrase'?(await db.query(`SELECT d.*,l.relation FROM learning_dialogue_links l JOIN curriculum_dialogues d ON d.id=l.dialogue_id WHERE l.phrase_id=$1 AND (d.is_free OR $2::boolean) ORDER BY d.sort_order,d.id`,[source.id,full])).rows:[];
  const state=await one('SELECT status,next_review_at FROM progress WHERE user_id=$1 AND material_id=$2',[u.id,source.id]);
  return {source:{...source,...state},materials:rows.map(m=>({...m,...m.kind==='word'?{forms:[m.english.toLowerCase(),...(wordForms[m.english.toLowerCase()]||[])]}:{}})),dialogues};
 }
 if(method==='GET'&&path==='/api/learning-v2/patterns')return {variants:(await db.query('SELECT * FROM learning_pattern_variants WHERE is_free OR $1::boolean ORDER BY template_id,sort_order,id',[full])).rows};
 if(method==='POST'&&path==='/api/learning-v2/results'){
  requireValue(['listening','expression','pattern'].includes(b.mode)&&typeof b.succeeded==='boolean'&&typeof b.request_id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(b.request_id),'Invalid practice result');
  requireValue(!('user_id' in b),'User is determined by the session');
  const target=await material(b.target_id,b.mode==='pattern');
  await db.query('BEGIN');
  try{
   await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
   const prior=await one('SELECT * FROM learning_exercise_events WHERE user_id=$1 AND request_id=$2',[u.id,b.request_id]);
   if(prior){if(prior.mode!==b.mode||(prior.material_id||prior.variant_id)!==target.id||prior.succeeded!==b.succeeded)throw new HttpError(409,'Practice request already used');await db.query('COMMIT');return {ok:true,duplicate:true};}
   const previous=await one('SELECT * FROM learning_exercise_progress WHERE user_id=$1 AND mode=$2 AND target_id=$3',[u.id,b.mode,target.id]);
   const streak=b.succeeded?Math.min((previous?.streak||0)+1,5):0;
   const minutes=b.succeeded?[1440,4320,10080,20160,43200][streak-1]:10;
   const next=new Date(Date.now()+minutes*60000).toISOString();
   await db.query(`INSERT INTO learning_exercise_events(id,user_id,request_id,mode,material_id,variant_id,succeeded) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),u.id,b.request_id,b.mode,b.mode==='pattern'?null:target.id,b.mode==='pattern'?target.id:null,b.succeeded]);
   await db.query(`INSERT INTO learning_exercise_progress(user_id,mode,target_id,attempts,successes,last_succeeded,streak,next_review_at) VALUES($1,$2,$3,1,$4,$5,$6,$7)
    ON CONFLICT(user_id,mode,target_id) DO UPDATE SET attempts=learning_exercise_progress.attempts+1,successes=learning_exercise_progress.successes+EXCLUDED.successes,last_succeeded=EXCLUDED.last_succeeded,streak=EXCLUDED.streak,next_review_at=EXCLUDED.next_review_at,updated_at=now()`,[u.id,b.mode,target.id,b.succeeded?1:0,b.succeeded,streak,next]);
   await db.query('COMMIT');return {ok:true,next_review_at:next};
  }catch(e){await db.query('ROLLBACK');throw e;}
 }
 if(method==='GET'&&path==='/api/learning-v2/analytics'){
  const ordinary=(await db.query(`SELECT m.kind,count(*)::int AS studied,count(*) FILTER(WHERE p.status='mastered')::int AS mastered,count(*) FILTER(WHERE p.status='unmastered')::int AS unmastered,count(*) FILTER(WHERE p.next_review_at<=now())::int AS due
   FROM progress p JOIN materials m ON m.id=p.material_id WHERE p.user_id=$1 AND (m.is_free OR $2::boolean) GROUP BY m.kind`,[u.id,full])).rows;
  const practice=(await db.query(`SELECT p.mode,count(*)::int AS practiced,sum(p.attempts)::int AS attempts,sum(p.successes)::int AS successes,count(*) FILTER(WHERE NOT p.last_succeeded)::int AS weak,count(*) FILTER(WHERE p.next_review_at<=now())::int AS due
   FROM learning_exercise_progress p LEFT JOIN materials m ON m.id=p.target_id AND p.mode<>'pattern' LEFT JOIN learning_pattern_variants v ON v.id=p.target_id AND p.mode='pattern'
   WHERE p.user_id=$1 AND (COALESCE(m.is_free,v.is_free,false) OR $2::boolean) GROUP BY p.mode`,[u.id,full])).rows;
  const weaknesses=(await db.query(`SELECT p.mode,p.target_id,p.attempts,p.successes,p.next_review_at,COALESCE(m.english,v.english) AS english,COALESCE(m.chinese,v.chinese) AS chinese
   FROM learning_exercise_progress p LEFT JOIN materials m ON m.id=p.target_id AND p.mode<>'pattern' LEFT JOIN learning_pattern_variants v ON v.id=p.target_id AND p.mode='pattern'
   WHERE p.user_id=$1 AND NOT p.last_succeeded AND (COALESCE(m.is_free,v.is_free,false) OR $2::boolean) ORDER BY p.next_review_at,p.target_id LIMIT 20`,[u.id,full])).rows;
  return {ordinary,practice,weaknesses};
 }
 if(method==='GET'&&path==='/api/learning-v2/review'){
  const mode=query.get('mode')||'all';requireValue(['all','listening','expression','pattern'].includes(mode));
  const all=query.get('all')==='true';
  const exercises=(await db.query(`SELECT p.*,COALESCE(m.english,v.english) AS english,COALESCE(m.chinese,v.chinese) AS chinese FROM learning_exercise_progress p
   LEFT JOIN materials m ON m.id=p.target_id AND p.mode<>'pattern' LEFT JOIN learning_pattern_variants v ON v.id=p.target_id AND p.mode='pattern'
   WHERE p.user_id=$1 AND ($2='all' OR p.mode=$2) AND ($3::boolean OR p.next_review_at<=now()) AND (COALESCE(m.is_free,v.is_free,false) OR $4::boolean)
   ORDER BY p.last_succeeded,p.next_review_at,p.target_id`,[u.id,mode,all,full])).rows;
  const related=(await db.query(`SELECT DISTINCT m.*,p.material_id AS source_id FROM progress p JOIN learning_word_links l ON (l.word_id=p.material_id OR l.phrase_id=p.material_id)
   JOIN materials m ON m.id=CASE WHEN l.word_id=p.material_id THEN l.phrase_id ELSE l.word_id END
   JOIN materials source ON source.id=p.material_id
   WHERE p.user_id=$1 AND p.status='unmastered' AND (m.is_free OR $2::boolean) AND (source.is_free OR $2::boolean) ORDER BY m.id LIMIT 20`,[u.id,full])).rows;
  return {exercises,related};
 }
 throw new HttpError(404,'Learning endpoint not found');
}
