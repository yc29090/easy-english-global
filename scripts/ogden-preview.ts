import {previewSettings} from '../src/ogden-preview-policy.ts';
import {readFile} from 'node:fs/promises';
// A local-only, ephemeral preview; never reads DATABASE_URL or .env.
import {PGlite} from '@electric-sql/pglite';
import type {DB} from '../src/db.ts';
import {prepareDatabase} from '../src/setup.ts';
import {installOgden} from '../src/install-ogden.ts';
import {loadOgden} from '../src/ogden-content.ts';
import {createApplication} from '../src/http.ts';
const {host,port,appUrl}=previewSettings(process.env);
const engine=new PGlite(),db:DB={query:async(sql,v)=>{if(!v&&sql.includes(';')){await engine.exec(sql);return {rows:[]};}const r=await engine.query(sql,v);return {rows:r.rows as any[],rowCount:r.affectedRows};}};
await prepareDatabase(db);await installOgden(db,await loadOgden(),JSON.parse(await readFile(new URL('../data/ogden/reviews.json',import.meta.url),'utf8')));
// HTTP transactions must not overlap on the single embedded connection.
let tail=Promise.resolve();
const pool={...db,connect:async()=>{const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await previous;return {...db,release};}};
const server=createApplication(pool,{production:false,appUrl,port,mockCheckout:false,mailProvider:'disabled',mailFrom:''},async()=>{},undefined,undefined,{isolatedPreview:true});
server.listen(port,host,()=>console.log('ISOLATED TEST ONLY; no production data, payments or mail. Local ephemeral preview: '+appUrl+'/ogden (register via /; data expires on exit)'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>{void engine.close();});});
