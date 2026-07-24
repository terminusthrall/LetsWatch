import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { requireEnv } from '@/lib/env';

const sql = neon(requireEnv('DATABASE_URL'));
export const db = drizzle(sql, { schema });
