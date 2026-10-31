import {readFile} from 'node:fs/promises';
import {database} from '../src/db.ts';
import {validateContent} from '../src/content.ts';
const path=process.argv[2];if(!path)throw new Error('Usage: npm run content:import -- /path/to/original.json');
const data=validateContent(JSON.parse(await readFile(path,'utf8'))),db=database();
try{await db.query('BEGIN');await db.query('LOCK TABLE materials,scenes IN EXCLUSIVE MODE');if((await db.query('SELECT id FROM materials LIMIT 1')).rowCount)throw new Error('Import requires an empty curriculum; existing progress must be preserved');for(const s of data.scenes)await db.query('INSERT INTO scenes VALUES($1,$2,$3,$4)',[s.id,s.title_en,s.title_zh,s.category]);for(const m of data.materials)await db.query('INSERT INTO materials(id,kind,english,chinese,scene_id,is_free,audio_normal,audio_slow) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[m.id,m.kind,m.english,m.chinese,m.scene_id,m.is_free,m.audio_normal||null,m.audio_slow||null]);await db.query('COMMIT');console.log('Imported 500 words, 200 phrases, 20 scenes');}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
