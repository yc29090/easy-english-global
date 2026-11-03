import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findLinkedWord} from '../public/learning-v2.js';
test('word definitions prefer an exact dictionary headword over a related inflected lemma',()=>{
 const meet={kind:'word',english:'meet',chinese:'见面',forms:['meet','meeting']},meeting={kind:'word',english:'meeting',chinese:'会议',forms:['meeting']};
 assert.equal(findLinkedWord([meet,meeting],'meeting'),meeting);assert.equal(findLinkedWord([meet,meeting],'MEETING'),meeting);
 const person={kind:'word',english:'person',forms:['person','people']},people={kind:'word',english:'people',forms:['people']};assert.equal(findLinkedWord([person,people],'people'),people);
});
test('word definitions retain explicit inflections without substring guesses',()=>{
 const child={kind:'word',english:'child',forms:['child','children']};assert.equal(findLinkedWord([child],'children'),child);assert.equal(findLinkedWord([child],'childcare'),undefined);
 const water={kind:'word',english:'water',forms:['water']};assert.equal(findLinkedWord([water],'waterproof'),undefined);
});
test('word definitions cannot return phrase entries as standalone dictionary meanings',()=>{
 assert.equal(findLinkedWord([{kind:'phrase',english:'meeting',forms:['meeting']}],'meeting'),undefined);
});
