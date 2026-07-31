import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  TMDB_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

/**
 * In CI the app must run against the dedicated test infrastructure. The
 * workflow is responsible for mapping the TEST_* secrets onto the app's
 * internal variables (TEST_DATABASE_URL -> DATABASE_URL, TEST_REDIS_URL ->
 * UPSTASH_REDIS_REST_URL). These variables carry the mapping expectation so
 * a misconfigured workflow fails fast with an actionable message.
 */
const CI_MAPPED_VARS: Array<{ internal: keyof Env; source: string }> = [
  { internal: 'DATABASE_URL', source: 'TEST_DATABASE_URL' },
  { internal: 'UPSTASH_REDIS_REST_URL', source: 'TEST_REDIS_URL' },
];

let cachedEnv: Env | undefined;

function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  if (process.env.CI) {
    const unmapped = CI_MAPPED_VARS.filter(({ internal }) => !process.env[internal]);
    if (unmapped.length > 0) {
      const details = unmapped
        .map(({ internal, source }) => `${internal} (map the ${source} secret to it)`)
        .join(', ');
      throw new Error(`CI environment is missing required variables: ${details}`);
    }
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ');
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export const env: Env = new Proxy({} as Env, {
  get(_, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});
