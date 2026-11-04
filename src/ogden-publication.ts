import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ConfigError} from './config.ts';
import type {DB} from './db.ts';
import {loadOgden} from './ogden-content.ts';
import {installOgden} from './install-ogden.ts';
import {ogdenReadiness,type OgdenReview} from './ogden-readiness.ts';

/** A release/rollback switch only; it never grants membership or preview access. */
export function ogdenPublished(env:Record<string,string|undefined>){
 const value=env.OGDEN_PUBLISHED;
 if(value!==undefined&&!['true','false'].includes(value))throw new ConfigError('OGDEN_PUBLISHED');
 return value==='true';
}
async function bundle(){
 const content=await loadOgden();
 const reviews:OgdenReview[]=JSON.parse(await readFile(new URL('../data/ogden/reviews.json',import.meta.url),'utf8'));
 const decisions=JSON.parse(await readFile(new URL('../data/ogden/launch-decisions.json',import.meta.url),'utf8'));
 const report=ogdenReadiness(content,decisions,reviews);
 // Device acceptance is honestly pending and explicitly deferred by the owner.
 // Human opening approval is not inferred from a JSON decision or from successful CI.
 // Only an explicitly enabled server-side flag can expose production routes.
 const required=['editorial-review','primary-source','membership-policy'];
 if(!report.checks.filter(c=>required.includes(c.id)).every(c=>c.passed)||decisions.deviceAcceptanceDeferredByOwner!==true)throw new Error('Ogden publication evidence is incomplete');
 if(report.counts.words!==850||report.counts.approved!==report.counts.items)throw new Error('Ogden publication curriculum is incomplete');
 return {content,reviews,hash:createHash('sha256').update(JSON.stringify(content)).digest('hex')};
}
let cached:ReturnType<typeof bundle>|undefined;
const publicationBundle=()=>cached??=bundle();

/** Bounded indexed checks keep free-service cold starts from reimporting thousands of rows. */
export async function ogdenPublicationReady(db:DB){
 const {content,hash}=await publicationBundle();
 const r=(await db.query(`SELECT
  (SELECT content_hash FROM ogden_installs WHERE version=$1) AS hash,
  (SELECT count(*)::int FROM ogden_items i WHERE i.id=ANY($2::text[]) AND i.review_status='approved') AS items,
  (SELECT count(*)::int FROM ogden_items i WHERE i.id=ANY($2::text[]) AND EXISTS(
   SELECT 1 FROM ogden_content_reviews r WHERE r.item_id=i.id AND r.version=i.version AND r.status='approved'
  )) AS reviewed`,[content.version,content.items.map(x=>x.id)])).rows[0];
 return r?.hash===hash&&r.items===content.items.length&&r.reviewed===content.items.length;
}
export async function prepareOgdenPublication(db:DB,enabled:boolean){
 if(!enabled)return {installed:false,enabled:false};
 if(await ogdenPublicationReady(db))return {installed:false,enabled:true};
 const {content,reviews}=await publicationBundle();
 await installOgden(db,content,reviews);
 if(!await ogdenPublicationReady(db))throw new Error('Ogden publication database is not ready');
 return {installed:true,enabled:true};
}
