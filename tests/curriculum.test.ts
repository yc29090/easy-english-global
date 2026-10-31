import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateContent,normalizeEnglish} from '../src/content.ts';
const curriculum=JSON.parse(readFileSync(new URL('../data/curriculum.json',import.meta.url),'utf8'));
test('shipped curriculum contains 500 words, 200 phrases, 20 scenes, 100 complete dialogues',()=>{
 const d=validateContent(curriculum);
 assert.equal(d.materials.filter(m=>m.kind==='word').length,500);assert.equal(d.materials.filter(m=>m.kind==='phrase').length,200);assert.equal(d.scenes.length,20);assert.equal(d.dialogues.length,100);
 for(const s of d.scenes){assert.equal(d.materials.filter(m=>m.scene_id===s.id&&m.kind==='word').length,25);assert.equal(d.materials.filter(m=>m.scene_id===s.id&&m.kind==='phrase').length,10);assert.equal(d.dialogues.filter(x=>x.scene_id===s.id).length,5);}
 assert.equal(d.dialogues.reduce((n,x)=>n+x.turns.length,0),400);
});
test('headwords and phrases have no case/spacing/punctuation-normalized duplicates',()=>{
 assert.equal(new Set(curriculum.materials.map((m:any)=>normalizeEnglish(m.english))).size,700);
 assert.equal(new Set(curriculum.materials.map((m:any)=>m.id)).size,700);
 assert.equal(new Set(curriculum.dialogues.map((d:any)=>d.turns.map((t:any)=>normalizeEnglish(t.english)).join('|'))).size,100);
 const duplicate=structuredClone(curriculum);duplicate.materials[1].english=' '+duplicate.materials[0].english.toUpperCase()+' ';assert.throws(()=>validateContent(duplicate));
 const punctuation=structuredClone(curriculum);const phrases=punctuation.materials.filter((m:any)=>m.kind==='phrase');phrases[1].english=phrases[0].english.replace(/[.!?]/g,'')+'!';assert.throws(()=>validateContent(punctuation),/Duplicate/);
});
test('all items and dialogue turns have real bilingual text and classified difficulty',()=>{
 for(const m of curriculum.materials){assert.match(m.chinese,/[\u3400-\u9fff]/);assert.match(m.english,/[A-Za-z]/);assert.ok([1,2,3].includes(m.difficulty));assert.doesNotMatch(m.chinese,/占位|测试数据|待翻译|示例\d/);}
 for(const d of curriculum.dialogues)for(const t of d.turns){assert.match(t.chinese,/[\u3400-\u9fff]/);assert.match(t.english,/[A-Za-z]/);}
 assert.deepEqual([...new Set(curriculum.scenes.map((s:any)=>s.category))].sort(),['business','life','travel']);
 for(const level of [1,2,3])assert.ok(curriculum.materials.some((m:any)=>m.difficulty===level));
});
for(const change of ['missing-translation','missing-dialogue','repeated-dialogue','invalid-role','wrong-difficulty','missing-word'])test('validator rejects '+change,()=>{
 const d=structuredClone(curriculum);
 if(change==='missing-translation')d.dialogues[0].turns[0].chinese='';
 if(change==='missing-dialogue')d.dialogues.pop();
 if(change==='repeated-dialogue')d.dialogues[1].turns=structuredClone(d.dialogues[0].turns);
 if(change==='invalid-role')d.dialogues[0].turns[1].role='a';
 if(change==='wrong-difficulty')d.materials[0].difficulty=3;
 if(change==='missing-word')d.materials.splice(0,1);
 assert.throws(()=>validateContent(d));
});
