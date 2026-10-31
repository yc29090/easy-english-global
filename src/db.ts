import pg from 'pg';
import {databaseOptions} from './config.ts';
export type DB = { query: (sql: string, values?: any[]) => Promise<{rows:any[];rowCount?:number|null}> };
export function database(){return new pg.Pool(databaseOptions());}
