import {createHash} from 'node:crypto';
import type {DB} from './db.ts';
import {validateOgden,type OgdenContent} from './ogden-content.ts';
/** Explicit preview import; intentionally not called by production startup/import. */
export async function installOgden(db:DB,input:OgdenContent){
 const content=validateOgden(input),hash=createHash('sha256').update(JSON.stringify(content)).digest('hex');
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(684013212)');
  const previous=(await db.query('SELECT content_hash FROM ogden_installs WHERE version=$1',[content.version])).rows[0];
  if(previous&&previous.content_hash!==hash)throw new Error('Ogden manifest version conflict; increment version');
  for(const s of content.sources)await db.query('INSERT INTO ogden_sources VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET details=EXCLUDED.details',[s.id,JSON.stringify(s)]);
  for(const r of content.originalReferences)await db.query('INSERT INTO ogden_original_references VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET source_id=EXCLUDED.source_id,details=EXCLUDED.details',[r.id,r.sourceId,JSON.stringify(r)]);
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
  await db.query('INSERT INTO ogden_installs VALUES($1,$2) ON CONFLICT DO NOTHING',[content.version,hash]);
  await db.query('COMMIT');return {items:content.items.length,approved:content.items.filter(x=>x.reviewStatus==='approved').length};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
