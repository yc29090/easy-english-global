import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import {loadOgden,validateOgden} from '../src/ogden-content.ts';
import {analyzeReference,englishTokens,expressionCoverage} from '../src/ogden-coverage.ts';
import {contentDigest} from '../src/ogden-readiness.ts';
import {acceptsOgdenGzip} from '../src/ogden-transfer.ts';
import {prepareDatabase} from '../src/setup.ts';import {installOgden} from '../src/install-ogden.ts';import {ogden} from '../src/ogden.ts';import {isolatedDatabase} from './test-db.ts';
const c=await loadOgden(),words=c.items.filter(x=>x.kind==='word');
test('850 modern core has four traceable authored batches and preserves every v5 identity',async()=>{
 assert.equal(words.length,850);assert.equal(new Set(words.map(w=>w.english.toLowerCase())).size,850);assert.equal(words.find(w=>w.id==='ow-wind')!.pronunciation.arpabet,'W IH1 N D');assert.equal(words.find(w=>w.id==='ow-wind')!.pronunciation.contextPlayback,true);
 const receipts=JSON.parse(await readFile(new URL('../docs/ogden/batch-validation.json',import.meta.url),'utf8'));assert.deepEqual(receipts.map((r:any)=>r.added),[150,150,125,125]);assert.deepEqual(receipts.map((r:any)=>r.total),[450,600,725,850]);
 const seen=new Set<string>();for(const r of receipts){const text=await readFile(new URL('../'+r.sourceFile,import.meta.url),'utf8');assert.equal(createHash('sha256').update(text).digest('hex'),r.sha256);const lines=text.split('\n').filter(l=>l&&!l.startsWith('#')&&!l.startsWith('@'));assert.equal(lines.length,r.added);for(const line of lines){const [name,zh,pos,en,cz,combo,comboZh,pattern]=line.split('|');const w=words.find(x=>x.english===name)!;assert.ok(w,name);assert.ok(!seen.has(name.toLowerCase()));seen.add(name.toLowerCase());assert.equal(w.chinese,zh);assert.equal(w.category,pos);assert.deepEqual(w.examples[0],{english:en,chinese:cz});assert.deepEqual(w.combinations[0],{english:combo,chinese:comboZh});assert.ok(w.patternIds.includes(pattern));}}
 assert.equal(seen.size,550);
 const history=JSON.parse(await readFile(new URL('../data/ogden/review-history/mbe-practical-core-v5.json',import.meta.url),'utf8'));assert.equal(history.length,490);for(const old of history){const current=c.items.find(x=>x.id===old.id)!;assert.ok(current);assert.ok(current.version>old.version);}
});
test('dependencies are explicit, acyclic in teaching order and cannot hide unknown tokens or stale references',()=>{
 const byId=new Map(words.map(w=>[w.id,w]));for(const w of words){for(const id of w.dependencies.prerequisiteWordIds)assert.ok(byId.get(id)!.teachingOrder<w.teachingOrder);for(const id of w.dependencies.previewWordIds)assert.ok(byId.get(id)!.teachingOrder>=w.teachingOrder);}
 for(const damage of ['cycle','coverage','comparison','intent','pattern']){const bad=structuredClone(c),task=bad.items.find(x=>x.kind==='expression')!;if(damage==='cycle')bad.items.find(x=>x.kind==='word')!.dependencies.prerequisiteWordIds.push('ow-come');if(damage==='coverage')task.referenceCoverage[0].allCore=!task.referenceCoverage[0].allCore;if(damage==='comparison')task.answerComparison='';if(damage==='intent')task.intentId='';if(damage==='pattern')bad.items.find(x=>x.kind==='word')!.patternIds=['ow-get'];assert.throws(()=>validateOgden(bad));}
 assert.deepEqual(englishTokens("I can't go. Let's wait."),['i','can','not','go','let','us','wait']);
 const unsupported=analyzeReference('I need a flibbertigibbet.',words,c.wordForms);assert.equal(unsupported.allCore,false);assert.deepEqual(unsupported.supplementalTokens,['flibbertigibbet']);
 assert.equal(analyzeReference('I need an example.',words,c.wordForms).allCore,true);
});
test('coverage is intent-deduplicated textbook capacity, excludes supplemental references and retired core words',async()=>{
 const r=expressionCoverage(c.items);assert.equal(r.taskItems,140);assert.equal(r.uniqueIntents,132);assert.equal(r.coreSupportedIndependentIntents,113);assert.equal(r.paraphraseItems,45);assert.equal(r.coreSupportedParaphraseIntents,41);assert.equal(r.isLearnerMastery,false);
 const duplicate=structuredClone(c.items.find(x=>x.id==='ex-arrival')!);duplicate.id='fixture-duplicate';assert.equal(expressionCoverage([...c.items,duplicate]).coreSupportedIntents,r.coreSupportedIntents);
 const unsupported=structuredClone(duplicate);unsupported.intentId='fixture-new-intent';unsupported.referenceCoverage=unsupported.referenceCoverage.map((x:any)=>({...x,allCore:false,supplementalTokens:['unlisted']}));assert.equal(expressionCoverage([...c.items,unsupported]).coreSupportedIntents,r.coreSupportedIntents);
 const fixture=[...words, {...duplicate,intentId:'one-only',referenceCoverage:[{english:'Get help.',wordIds:['ow-get','ow-help'],supplementalTokens:[],allCore:true}]}];assert.equal(expressionCoverage(fixture).coreSupportedIntents,1);assert.equal(expressionCoverage(fixture.filter(x=>x.id!=='ow-help')).coreSupportedIntents,0);
 const snapshot=JSON.parse(await readFile(new URL('../docs/ogden/expression-coverage.json',import.meta.url),'utf8'));for(const [key,value] of Object.entries(r))assert.deepEqual(snapshot[key],value);assert.equal(snapshot.contentDigest,contentDigest(c));assert.deepEqual(snapshot.tasks,c.items.filter(x=>x.kind==='expression').map(x=>({id:x.id,intentId:x.intentId,level:x.level,references:x.referenceCoverage})));
});
test('all operators and functional patterns have authored substitution, independent expression and review paths',()=>{
 const ops=c.items.filter(x=>x.kind==='operator'),patterns=c.items.filter(x=>x.kind==='pattern'),combos=c.items.filter(x=>x.kind==='combination');assert.equal(ops.length,18);assert.equal(patterns.length,48);assert.equal(combos.length,109);
 for(const op of ops){assert.equal(op.learningSteps.length,6);assert.equal(op.variants.length,3);assert.ok(op.practiceCombinationIds.length>=6);assert.ok(op.expressionTaskIds.every((id:string)=>c.items.some(x=>x.id===id&&x.operatorWordId===op.wordId)));}
 for(const p of patterns){assert.ok(p.structureHint);assert.equal(p.variants.length,3);assert.ok(p.expressionTaskIds.every((id:string)=>c.items.some(x=>x.id===id&&x.patternIds.includes(p.id))));}
});
test('gzip negotiation is explicit and honors q=0 without affecting unsupported encodings',()=>{
 assert.equal(acceptsOgdenGzip('gzip, deflate, br'),true);assert.equal(acceptsOgdenGzip('GZIP; q=0.5'),true);for(const header of [undefined,'br','*','gzip;q=0','gzip;q=oops','gzip;q=2'])assert.equal(acceptsOgdenGzip(header),false);
});
test('actual v5 payloads, events and review evidence survive v6 import and repeated migrations untouched',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);const fixture=JSON.parse(await readFile(new URL('./fixtures/ogden-v5-upgrade.json',import.meta.url),'utf8'));
  for(const x of fixture.items){await db.query('INSERT INTO ogden_items VALUES($1,$2,$3,$4,$5)',[x.id,x.kind,x.version,JSON.stringify(x),x.reviewStatus]);await db.query('INSERT INTO ogden_item_versions VALUES($1,$2,$3)',[x.id,x.version,JSON.stringify(x)]);}
  for(const r of fixture.reviews)await db.query('INSERT INTO ogden_content_reviews(id,item_id,version,status,reviewer,notes,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[['fixture',r.id,r.version].join(':'),r.id,r.version,r.decision,r.reviewer,JSON.stringify(r),r.reviewedAt]);
  const user=randomUUID();await db.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[user,user+'@example.invalid']);
  const save=(mode:string,status:string)=>ogden({db,userId:user,path:'/api/ogden/results',method:'POST',body:{item_id:'ow-get',mode,status,request_id:randomUUID()}});
  await save('listening','unmastered');await save('speaking','mastered');
  const snapshot=async()=>({progress:(await db.query('SELECT * FROM ogden_progress')).rows,modes:(await db.query('SELECT * FROM ogden_practice_progress ORDER BY mode')).rows,events:(await db.query('SELECT * FROM ogden_practice_events ORDER BY mode')).rows,reviews:(await db.query('SELECT * FROM ogden_content_reviews ORDER BY id')).rows});const before=await snapshot();
  await installOgden(db,c);await installOgden(db,c);await prepareDatabase(db);assert.deepEqual(await snapshot(),before);
  const versions=(await db.query("SELECT payload FROM ogden_item_versions WHERE item_id='ow-get' ORDER BY version")).rows;assert.equal(versions.length,2);assert.deepEqual(versions[0].payload,fixture.items.find((x:any)=>x.id==='ow-get'));assert.equal(versions[1].payload.version,c.items.find(x=>x.id==='ow-get')!.version);
  assert.equal((await ogden({db,userId:user,path:'/api/ogden/review',method:'GET',body:{},query:new URLSearchParams('mode=listening')})).items[0].status,'unmastered');
 }finally{await cleanup();}
});
