import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { requireEnv } from '@/lib/env';
import * as schema from './schema';

const sql = neon(requireEnv('DATABASE_URL'));
export const db = drizzle(sql, { schema });
