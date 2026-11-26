import type { AstroGlobal } from 'astro';
import { findRegion } from './regions';

/** The region a page under /event/<region>/ is for. */
export interface RegionPage {
  /** Lower-case, as in the path. */
  region: string;
  /** Upper-case, as the main site and the events store it. */
  regionCode: string;
}

/**
 * The region in this page's path, or the response to send instead: a
 * redirect to the lower-case path, or the 404 page for a region the main site
 * does not have. The main site down should not take the event pages with it,
 * so a well-formed code is then let through.
 */
export async function regionPage(Astro: AstroGlobal): Promise<RegionPage | Response> {
  const param = Astro.params.region ?? '';
  if (param !== param.toLowerCase()) {
    return Astro.redirect(Astro.url.pathname.replace(`/event/${param}`, `/event/${param.toLowerCase()}`) + Astro.url.search, 301);
  }
  const env = Astro.locals.runtime?.env;
  const known = env ? await findRegion(env, Astro.request, param).catch(() => (/^[a-z]{2}$/.test(param) ? { code: param } : null)) : null;
  if (!known) return Astro.rewrite('/404');
  return { region: param, regionCode: known.code.toUpperCase() };
}

/** Whether a path segment is a UUID, as every event, drive and organization id is. */
export function isUuid(value: string | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value ?? '');
}
