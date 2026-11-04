import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ogdenEntitlement} from '../src/ogden-policy.ts';
import {loadOgden} from '../src/ogden-content.ts';
import {ogdenReadiness,reviewDigest,type OgdenReview} from '../src/ogden-readiness.ts';
import {isolatedDatabase} from './test-db.ts';
import {prepareDatabase} from '../src/setup.ts';
import {installOgden} from '../src/install-ogden.ts';
const c=await loadOgden();
const readJson=async(file:string)=>JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'));
test('existing paid members cover both versions with zero additional price, trial expiry is unchanged',()=>{
 const now=Date.parse('2026-11-04T00:00:00Z');
 assert.equal(ogdenEntitlement({membership:'lifetime'},now).coversBothVersions,true);
 assert.equal(ogdenEntitlement({membership:'lifetime'},now).additionalChargeCny,0);
 assert.equal(ogdenEntitlement({membership:'trial',trial_until:'2026-11-05T00:00:00Z'},now).coversBothVersions,true);
 assert.equal(ogdenEntitlement({membership:'trial',trial_until:'2026-11-04T00:00:00Z'},now).coversBothVersions,false);
 assert.equal(ogdenEntitlement({membership:'free'},now).coversBothVersions,false);
 assert.equal(ogdenEntitlement({membership:'free'},now).nonMemberScope,'not-yet-set');
 assert.equal(ogdenEntitlement({membership:'lifetime'},now).productionEnabled,false);
});
test('historical 850-reference index explains 852 spellings; modern core is 217, never a fabricated complete 850 course',async()=>{
 const index=await readJson('data/ogden/historical-index.json'),raw=(await readFile(new URL('../data/ogden/secondary-wordlist.txt',import.meta.url),'utf8')).trim().split('\n');
 const canonical=(w:string)=>({gray:'grey',plow:'plough'}[w.toLowerCase()]||w.toLowerCase());
 const counts=Object.values(index.categories).reduce((m:any,k:any)=>{m[k]=(m[k]||0)+1;return m;},{});assert.deepEqual(counts,{operations:100,'things-general':400,'things-picturable':200,'qualities-general':100,'qualities-opposites':50});
 assert.equal(raw.length,852);assert.equal(index.entries.length,850);assert.deepEqual([...new Set(raw.map(canonical))].sort(),index.entries);
 const words=c.items.filter(x=>x.kind==='word');assert.equal(words.length,217);assert.equal(words.filter(x=>x.isOgdenOriginal).length,132);assert.equal(words.filter(x=>!x.isOgdenOriginal).length,85);
 for(const w of words){assert.equal(w.isOgdenOriginal,index.entries.includes(canonical(w.english)));const r=c.originalReferences.find(r=>r.id===w.originalRef);assert.equal(r.verification,'verified');assert.ok(r.verificationMethod);}
 assert.equal(words.find(w=>w.english==='we')!.originRelation,'grammatical-form');assert.equal(words.find(w=>w.english==='phone')!.modernStatus,'added');
});
test('authorized developer self-review is explicit, version-bound and never impersonates independent humans',async()=>{
 const decisions=await readJson('data/ogden/launch-decisions.json'),reviews:OgdenReview[]=await readJson('data/ogden/reviews.json');
 assert.equal(reviews.length,373);assert.ok(reviews.every(r=>r.reviewerKind==='developer-self-check'&&r.humanReviewer===null));
 const report=ogdenReadiness(c,decisions,reviews);assert.equal(report.counts.developerSelfChecked,373);assert.equal(report.counts.humanReviewed,0);assert.equal(report.readyForProduction,false);
 assert.equal(report.checks.find(x=>x.id==='editorial-review')!.passed,true);assert.equal(report.checks.find(x=>x.id==='primary-source')!.passed,true);assert.equal(report.checks.find(x=>x.id==='membership-policy')!.passed,true);assert.equal(report.checks.find(x=>x.id==='device-voice')!.passed,false);
 assert.equal(ogdenReadiness(c,{...decisions,editorialSelfReviewAuthorized:false},reviews).checks[0].passed,false);
 const stale=structuredClone(reviews);stale[0].digest='outdated';assert.equal(ogdenReadiness(c,decisions,stale).checks[0].passed,false);
});
test('self-review evidence imports idempotently and stale review rolls back without erasing practice',async()=>{
 const {db,cleanup}=await isolatedDatabase();try{
  await prepareDatabase(db);const reviews:OgdenReview[]=await readJson('data/ogden/reviews.json');
  await installOgden(db,c,reviews);await installOgden(db,c,reviews);
  assert.equal((await db.query('SELECT count(*)::int n FROM ogden_content_reviews')).rows[0].n,373);
  assert.equal(reviews[0].digest,reviewDigest(c.items[0]));
  const stale=structuredClone(reviews);stale[0].digest='bad';await assert.rejects(()=>installOgden(db,c,stale),/stale review/);
  assert.equal((await db.query('SELECT count(*)::int n FROM ogden_content_reviews')).rows[0].n,373);
 }finally{await cleanup();}
});
