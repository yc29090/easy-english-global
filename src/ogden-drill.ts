import type {DB} from './db.ts';
/** Test-only fingerprinting. Reject public/production namespaces before reading any rows. */
export async function drillSnapshot(db:DB){
 const schema=(await db.query('SELECT current_schema() AS name')).rows[0].name;
 if(!/^ee_(?:runtime|backup)_[a-f0-9]+$/.test(schema))throw Error('Snapshot requires a generated isolated test schema');
 const names=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",[schema])).rows;
 const result:Record<string,{rows:number;digest:string}>={};
 for(const {table_name:name} of names){if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error('Unexpected test table name');result[name]=(await db.query(`SELECT count(*)::int AS rows,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM "${schema}"."${name}" t`)).rows[0];}
 return result;
}
