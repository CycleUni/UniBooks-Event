import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// Tables come from migrations/ only (wrangler d1 migrations apply). The
// database is the main site's: this Worker never creates or alters its tables.
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
export * from './schema';
