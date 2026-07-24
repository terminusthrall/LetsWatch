/**
 * Read a required environment variable, throwing a descriptive error when absent.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}
