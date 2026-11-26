/**
 * Paths under the region a page is for (/event/<region>/...). Everything in
 * this system lives under a region: the draws, the book drives, and the pages
 * that manage them.
 */

/** A path under the current region, e.g. regionPath('/drives') is /event/tw/drives. */
export function regionPath(path: string): string {
  return `/event/${window.__getRegion()}${path}`;
}

/**
 * Move to this same page under the region an event, drive or organization
 * belongs to, when the path names another (an old link, a region switched in
 * another tab). True when it is moving, so the caller stops there.
 */
export function followRegion(region: string): boolean {
  const want = region.toLowerCase();
  const match = location.pathname.match(/^\/event\/([a-z]{2})(\/.*)?$/);
  if (!match || match[1] === want) return false;
  try {
    localStorage.setItem('region', want);
  } catch {
    // The path carries the region; storage only remembers it.
  }
  location.replace(`/event/${want}${match[2] ?? ''}${location.search}`);
  return true;
}
