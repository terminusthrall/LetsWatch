import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: Db | undefined;

function getDb(): Db {
  if (dbInstance) return dbInstance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const sql = neon(url);
  dbInstance = drizzle(sql, { schema });
  return dbInstance;
}

export const db = new Proxy({} as Db, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});
