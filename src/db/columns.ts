import { AnyPgColumn, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import type { Table } from 'drizzle-orm';

/** Random UUID primary key, named `id`. */
export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/** Timestamp column defaulting to now, e.g. `created_at` / `added_at`. */
export const createdTimestamp = (name: string) => timestamp(name).defaultNow().notNull();

/** Required UUID foreign key that cascades on delete of the referenced row. */
export const cascadingRef = (name: string, reference: () => AnyPgColumn) =>
  uuid(name)
    .references(reference, { onDelete: 'cascade' })
    .notNull();

/** Insert/select Zod contracts for a table, used at API boundaries. */
export const tableSchemas = <T extends Table>(table: T) => ({
  insert: createInsertSchema(table),
  select: createSelectSchema(table),
});
