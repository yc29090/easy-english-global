import {reviewDigest,type OgdenReview} from './ogden-readiness.ts';
import {createHash} from 'node:crypto';
import type {DB} from './db.ts';
import {validateOgden,type OgdenContent} from './ogden-content.ts';
/** Explicit import; production startup calls this only behind the publication switch. */
export async function installOgden(db:DB,input:OgdenContent,reviews:OgdenReview[]=[]){
 const content=validateOgden(input),hash=createHash('sha256').update(JSON.stringify(content)).digest('hex');
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(684013212)');
  const previous=(await db.query('SELECT content_hash FROM ogden_installs WHERE version=$1',[content.version])).rows[0];
  if(previous&&previous.content_hash!==hash)throw new Error('Ogden manifest version conflict; increment version');
  // Provenance IDs are immutable too; corrections must use a new source/reference ID.
  for(const source of content.sources){
   const old=(await db.query('SELECT details=$2::jsonb AS same FROM ogden_sources WHERE id=$1',[source.id,JSON.stringify(source)])).rows[0];
   if(old&&!old.same)throw new Error('Ogden source identity conflict: '+source.id);
   await db.query('INSERT INTO ogden_sources VALUES($1,$2) ON CONFLICT DO NOTHING',[source.id,JSON.stringify(source)]);
  }
  for(const ref of content.originalReferences){
   const old=(await db.query('SELECT details=$2::jsonb AS same FROM ogden_original_references WHERE id=$1',[ref.id,JSON.stringify(ref)])).rows[0];
   if(old&&!old.same)throw new Error('Ogden reference identity conflict: '+ref.id);
   await db.query('INSERT INTO ogden_original_references VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[ref.id,ref.sourceId,JSON.stringify(ref)]);
  }
  for(const x of content.items){
   const current=(await db.query('SELECT kind FROM ogden_items WHERE id=$1',[x.id])).rows[0];
   if(current&&current.kind!==x.kind)throw new Error('Ogden stable ID kind conflict: '+x.id);
   // Immutable versions prevent silent edits and retain the version used by past practice.
   const old=(await db.query('SELECT payload FROM ogden_item_versions WHERE item_id=$1 AND version=$2',[x.id,x.version])).rows[0];
   if(old&&JSON.stringify(old.payload)!==JSON.stringify(JSON.parse(JSON.stringify(x)))){
    // PostgreSQL jsonb normalizes key order; compare canonical hashes in SQL.
    const same=(await db.query('SELECT payload=$3::jsonb AS same FROM ogden_item_versions WHERE item_id=$1 AND version=$2',[x.id,x.version,JSON.stringify(x)])).rows[0];
    if(!same.same)throw new Error('Ogden item version conflict: '+x.id);
   }
   await db.query(`INSERT INTO ogden_items VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,payload=EXCLUDED.payload,review_status=EXCLUDED.review_status WHERE ogden_items.version<EXCLUDED.version`,[x.id,x.kind,x.version,JSON.stringify(x),x.reviewStatus]);
   await db.query('INSERT INTO ogden_item_versions VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[x.id,x.version,JSON.stringify(x)]);
  }
  for(const r of reviews){
   const item=content.items.find(x=>x.id===r.id&&x.version===r.version);
   if(!item||r.digest!==reviewDigest(item))throw new Error('Ogden stale review: '+r.id);
   const reviewer=r.reviewerKind==='developer-self-check'?r.reviewer:r.humanReviewer;
   if(!reviewer||!r.notes||!Number.isFinite(Date.parse(r.reviewedAt))||!['approved','rejected'].includes(r.decision))throw new Error('Ogden invalid review: '+r.id);
   const id=[r.id,r.version,r.digest,r.reviewerKind||'human'].join(':');
   await db.query('INSERT INTO ogden_content_reviews(id,item_id,version,status,reviewer,notes,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[id,r.id,r.version,r.decision,reviewer,JSON.stringify({method:r.reviewerKind||'human',notes:r.notes,digest:r.digest}),r.reviewedAt]);
  }
  await db.query('INSERT INTO ogden_installs VALUES($1,$2) ON CONFLICT DO NOTHING',[content.version,hash]);
  await db.query('COMMIT');return {items:content.items.length,approved:content.items.filter(x=>x.reviewStatus==='approved').length};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
