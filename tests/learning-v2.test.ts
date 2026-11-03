import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildLearningLinks,wordMatches,englishTokens} from '../src/learning-links.ts';
import {buildPatternVariants} from '../src/learning-patterns.ts';
import {validateContent} from '../src/content.ts';
const content=validateContent(JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8')));
test('V2 associations use whole tokens, explicit common forms, punctuation and contractions',()=>{
 assert.equal(wordMatches('water','Water, please.'),'exact');assert.equal(wordMatches('water','waterproof'),null);
 assert.equal(wordMatches('I','airport'),null);assert.equal(wordMatches('he','the hotel'),null);assert.equal(wordMatches('tea','teacher'),null);
 assert.equal(wordMatches('child','Do you have children?'),'inflection');assert.equal(wordMatches('be',"I'm ready."),'inflection');assert.equal(wordMatches('charge','My phone needs charging.'),'inflection');
 assert.deepEqual(englishTokens('You’re here.'),['you','are','here']);assert.equal(wordMatches('check-in','The check-in counter.'),'exact');
});
test('V2 associations have stable unique valid IDs and existing-scene dialogue links',()=>{
 const a=buildLearningLinks(content),b=buildLearningLinks(content);assert.deepEqual(a,b);assert.ok(a.wordLinks.length>500);assert.equal(a.dialogueLinks.length,1000);
 assert.equal(new Set(a.wordLinks.map(l=>l.word_id+':'+l.phrase_id)).size,a.wordLinks.length);
 const materials=new Map(content.materials.map(m=>[m.id,m])),dialogues=new Map(content.dialogues.map(d=>[d.id,d]));
 for(const l of a.wordLinks){const w=materials.get(l.word_id)!,p=materials.get(l.phrase_id)!;assert.equal(w.kind,'word');assert.equal(p.kind,'phrase');assert.equal(wordMatches(w.english,p.english),l.relation);}
 for(const l of a.dialogueLinks)assert.equal(materials.get(l.phrase_id)!.scene_id,dialogues.get(l.dialogue_id)!.scene_id);
});
test('V2 patterns are finite complete bilingual examples using existing word permissions',()=>{
 const variants=buildPatternVariants(content);assert.equal(variants.length,20);assert.equal(new Set(variants.map(v=>v.template_id)).size,4);assert.equal(new Set(variants.map(v=>v.id)).size,20);
 for(const v of variants){const w=content.materials.find(m=>m.id===v.word_id)!;assert.equal(w.kind,'word');assert.equal(v.is_free,w.is_free);assert.match(v.chinese,/[\u3400-\u9fff]/);assert.ok(wordMatches(w.english,v.english));assert.doesNotMatch(v.english,/[{}<>]/);}
 assert.equal(variants.filter(v=>v.is_free).length,4);assert.ok(variants.some(v=>v.english==='I would like some water.'));
});
