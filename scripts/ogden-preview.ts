// A local-only, ephemeral preview; never reads DATABASE_URL or .env.
import {PGlite} from '@electric-sql/pglite';
import type {DB} from '../src/db.ts';
import {prepareDatabase} from '../src/setup.ts';
import {installOgden} from '../src/install-ogden.ts';
import {loadOgden} from '../src/ogden-content.ts';
import {createApplication} from '../src/http.ts';
if(process.env.NODE_ENV==='production')throw new Error('Ogden preview is local-only');
const engine=new PGlite(),db:DB={query:async(sql,v)=>{if(!v&&sql.includes(';')){await engine.exec(sql);return {rows:[]};}const r=await engine.query(sql,v);return {rows:r.rows as any[],rowCount:r.affectedRows};}};
await prepareDatabase(db);await installOgden(db,await loadOgden());
// HTTP transactions must not overlap on the single embedded connection.
let tail=Promise.resolve();
const pool={...db,connect:async()=>{const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await previous;return {...db,release};}};
const port=3100,appUrl='http://127.0.0.1:'+port;
const server=createApplication(pool,{production:false,appUrl,port,mockCheckout:false,mailProvider:'disabled',mailFrom:''},async()=>{});
server.listen(port,'127.0.0.1',()=>console.log('Local ephemeral preview: '+appUrl+'/ogden (register via /; data expires on exit)'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>{void engine.close();});});
