/**
 * Read a required environment variable, throwing a descriptive error when it is
 * missing or blank instead of failing later with an opaque runtime error.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to your .env file (see .env.example).`,
    );
  }

  return value;
}
