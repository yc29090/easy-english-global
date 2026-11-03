import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Curriculum} from './content.ts';
import type {DB} from './db.ts';
import {buildLearningLinks} from './learning-links.ts';
import {buildPatternVariants} from './learning-patterns.ts';
const content=JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8')) as Curriculum;
export const learningSeed={...buildLearningLinks(content),variants:buildPatternVariants(content)};
const hash=createHash('sha256').update(JSON.stringify(learningSeed)).digest('hex'),version='ee-learning-v2-1';
export async function installLearningV2(db:DB){
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(684013214)');
  const installed=(await db.query('SELECT content_hash FROM learning_v2_installs WHERE version=$1',[version])).rows[0];
  if(installed){if(installed.content_hash!==hash)throw new Error('Learning V2 installed version differs');await db.query('COMMIT');return;}
  await db.query(`INSERT INTO learning_word_links SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(word_id text,phrase_id text,relation text)`,[JSON.stringify(learningSeed.wordLinks)]);
  await db.query(`INSERT INTO learning_dialogue_links SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(phrase_id text,dialogue_id text,relation text)`,[JSON.stringify(learningSeed.dialogueLinks)]);
  await db.query(`INSERT INTO learning_pattern_variants SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text,template_id text,template_en text,template_zh text,word_id text,english text,chinese text,is_free boolean,sort_order integer)`,[JSON.stringify(learningSeed.variants)]);
  await db.query('INSERT INTO learning_v2_installs VALUES($1,$2)',[version,hash]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}

export async function learningV2Ready(db:DB){const row=(await db.query('SELECT content_hash FROM learning_v2_installs WHERE version=$1',[version])).rows[0];return row?.content_hash===hash;}
