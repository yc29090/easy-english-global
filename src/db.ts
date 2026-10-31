import pg from 'pg';
export type DB = { query: (sql: string, values?: any[]) => Promise<{rows:any[];rowCount?:number|null}> };
export function database() {
 if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
 return new pg.Pool({connectionString:process.env.DATABASE_URL, max:10});
}
