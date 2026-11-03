import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {DB} from './db.ts';
import {migrate,migrations} from './migrations.ts';
import {installContent} from './install-content.ts';
import {installLearningV2,learningV2Ready} from './install-learning-v2.ts';
import {validateContent} from './content.ts';
const content=validateContent(JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8')));
const contentHash=createHash('sha256').update(JSON.stringify(content)).digest('hex');
export async function prepareDatabase(db:DB){
 await migrate(db);
 const row=(await db.query('SELECT content_hash FROM curriculum_installs WHERE version=$1',[content.version])).rows[0];
 if(row?.content_hash===contentHash){
  // A quick completeness check avoids 800+ round trips on each free-service cold start.
  const result=(await db.query(`SELECT
   (SELECT count(*)::int FROM scenes WHERE id=ANY($1::text[])) AS scenes,
   (SELECT count(*)::int FROM materials WHERE id=ANY($2::text[])) AS materials,
   (SELECT count(*)::int FROM curriculum_dialogues WHERE id=ANY($3::text[])) AS dialogues`,[content.scenes.map(s=>s.id),content.materials.map(m=>m.id),content.dialogues.map(d=>d.id)])).rows[0];
  if(result.scenes===20&&result.materials===700&&result.dialogues===100){await installLearningV2(db);return {alreadyInstalled:true};}
 }
 await installContent(db,content);await installLearningV2(db);return {alreadyInstalled:false};
}
export async function ready(db:DB){
 const names=(await db.query('SELECT name FROM schema_migrations WHERE name=ANY($1::text[])',[migrations])).rows;
 if(names.length!==migrations.length)return false;
 const row=(await db.query('SELECT content_hash FROM curriculum_installs WHERE version=$1',[content.version])).rows[0];
 return row?.content_hash===contentHash&&await learningV2Ready(db);
}
