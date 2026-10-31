import {readFile} from 'node:fs/promises';
import {validateContent} from '../src/content.ts';
const data=validateContent(JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8')));
console.log(JSON.stringify({version:data.version,words:data.materials.filter(m=>m.kind==='word').length,phrases:data.materials.filter(m=>m.kind==='phrase').length,scenes:data.scenes.length,dialogues:data.dialogues.length,turns:data.dialogues.reduce((n,d)=>n+d.turns.length,0),minimumDialoguesPerScene:Math.min(...data.scenes.map(s=>data.dialogues.filter(d=>d.scene_id===s.id).length))},null,2));
