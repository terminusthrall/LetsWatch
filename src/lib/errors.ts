/**
 * Base class for errors raised by application infrastructure. Preserves the
 * originating error as `cause` so the root failure is never lost.
 */
export class AppError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A Redis command failed. */
export class RedisOperationError extends AppError {}

/** Data read back from Redis did not match the expected shape. */
export class RedisDataError extends AppError {}

/**
 * Run a Redis command, rethrowing failures as a `RedisOperationError` that
 * names the operation and key so callers can log actionable context.
 */
export async function withRedisErrors<T>(
  operation: string,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    throw new RedisOperationError(`Redis ${operation} failed for key "${key}"`, { cause });
  }
}
