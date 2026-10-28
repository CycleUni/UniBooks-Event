import { mainFetch } from './main-site';

/** A region as the main site's GET /api/v1/core/regions describes it. */
export interface Region {
  code: string;
  name: string;
  localized_name: string;
  languages: string[];
  default_language: string;
}

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; regions: Promise<Region[]> } | null = null;

/**
 * The main site's regions. They live in its database, so this asks it, and
 * keeps the answer for a few minutes per isolate: every event write and
 * region page needs them, and they change rarely.
 */
export function getRegions(env: CloudflareEnv, request: Request): Promise<Region[]> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const regions = mainFetch(env, request, '/api/v1/core/regions').then(async (res) => {
      if (!res.ok) throw new Error(`main site /core/regions answered ${res.status}`);
      const list = (await res.json()) as Region[];
      if (!Array.isArray(list)) throw new Error('main site /core/regions: not a list');
      return list;
    });
    cached = { at: Date.now(), regions };
    // A failure is not kept: the next call asks again.
    regions.catch(() => {
      if (cached?.regions === regions) cached = null;
    });
  }
  return cached.regions;
}

/** The region with this code (either case), or null. */
export async function findRegion(env: CloudflareEnv, request: Request, code: string): Promise<Region | null> {
  const upper = code.toUpperCase();
  return (await getRegions(env, request)).find((r) => r.code.toUpperCase() === upper) ?? null;
}
