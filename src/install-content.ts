import {createHash} from 'node:crypto';
import type {DB} from './db.ts';
import {validateContent} from './content.ts';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Call with a dedicated connection. Conflicts roll back; existing rows are never updated/deleted. */
export async function installContent(db:DB,input:unknown){
 const data=validateContent(input),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const counts={scenes:0,words:0,phrases:0,dialogues:0};
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(684013212)');
  await db.query('LOCK TABLE scenes,materials,curriculum_dialogues IN SHARE ROW EXCLUSIVE MODE');
  const installed=(await db.query('SELECT * FROM curriculum_installs WHERE version=$1',[data.version])).rows[0];
  if(installed&&installed.content_hash!==hash)throw new Error('Installed version differs; use a new version and new stable IDs. Existing content is immutable.');
  for(const [index,s] of data.scenes.entries()){
   const existing=(await db.query('SELECT * FROM scenes WHERE id=$1',[s.id])).rows[0];
   if(existing){for(const key of ['title_en','title_zh','category','difficulty'] as const)if(existing[key]!==s[key])throw new Error('Scene conflict: '+s.id);continue;}
   await db.query('INSERT INTO scenes(id,title_en,title_zh,category,difficulty,sort_order) VALUES($1,$2,$3,$4,$5,$6)',[s.id,s.title_en,s.title_zh,s.category,s.difficulty,index]);counts.scenes++;
  }
  for(const m of data.materials){
   const existing=(await db.query('SELECT * FROM materials WHERE id=$1 OR (kind=$2 AND lower(english)=lower($3))',[m.id,m.kind,m.english])).rows;
   if(existing.length){const old=existing[0];for(const key of ['id','kind','english','chinese','scene_id','is_free','difficulty','sort_order'] as const)if(old[key]!==m[key])throw new Error('Material conflict: '+m.id);if((old.audio_normal||null)!==(m.audio_normal||null)||(old.audio_slow||null)!==(m.audio_slow||null))throw new Error('Audio conflict: '+m.id);continue;}
   await db.query('INSERT INTO materials(id,kind,english,chinese,scene_id,is_free,audio_normal,audio_slow,sort_order,difficulty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[m.id,m.kind,m.english,m.chinese,m.scene_id,m.is_free,m.audio_normal||null,m.audio_slow||null,m.sort_order,m.difficulty]);
   if(m.kind==='word')counts.words++;else counts.phrases++;
  }
  for(const [index,d] of data.dialogues.entries()){
   const old=(await db.query('SELECT * FROM curriculum_dialogues WHERE id=$1',[d.id])).rows[0];
   if(old){for(const key of ['scene_id','title_en','title_zh','category','difficulty','is_free'] as const)if(old[key]!==d[key])throw new Error('Dialogue conflict: '+d.id);if(!same(JSON.parse(JSON.stringify(old.roles)),JSON.parse(JSON.stringify(d.roles)))||!same(old.turns,d.turns)){
    // JSONB object key order is not stable; compare structural fields explicitly.
    const rolesEqual=(['a','b'] as const).every(r=>old.roles[r]?.zh===d.roles[r].zh&&old.roles[r]?.en===d.roles[r].en);
    const turnsEqual=Array.isArray(old.turns)&&old.turns.length===d.turns.length&&d.turns.every((t,i)=>old.turns[i].role===t.role&&old.turns[i].english===t.english&&old.turns[i].chinese===t.chinese);
    if(!rolesEqual||!turnsEqual)throw new Error('Dialogue text conflict: '+d.id);
   }continue;}
   await db.query('INSERT INTO curriculum_dialogues(id,scene_id,title_en,title_zh,category,difficulty,is_free,roles,turns,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[d.id,d.scene_id,d.title_en,d.title_zh,d.category,d.difficulty,d.is_free,JSON.stringify(d.roles),JSON.stringify(d.turns),index]);counts.dialogues++;
  }
  await db.query('INSERT INTO curriculum_installs(version,content_hash) VALUES($1,$2) ON CONFLICT(version) DO NOTHING',[data.version,hash]);
  await db.query('COMMIT');
  return {version:data.version,inserted:counts,expected:{words:500,phrases:200,scenes:20,dialogues:data.dialogues.length}};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
