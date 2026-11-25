/**
 * The main site's public reference data for a region (GET /api/v1/core/metadata):
 * its schools and its colleges with their departments, in the page language.
 * Read once per region and language for the page's life; every picker shares it.
 */

export interface RegionMetadata {
  schools?: { id: number; code: string; display_name: string }[];
  categories?: { title: string; departments?: { name: string; aliases?: string[] }[] }[];
}

const cache = new Map<string, Promise<RegionMetadata>>();

export function regionMetadata(region: string): Promise<RegionMetadata> {
  const lang = window.__getLang();
  const key = `${region.toLowerCase()}|${lang}`;
  let p = cache.get(key);
  if (!p) {
    const q = new URLSearchParams({ region: region.toLowerCase(), lang });
    p = fetch(`/api/v1/core/metadata?${q}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<RegionMetadata>) : {}))
      .catch(() => ({}));
    cache.set(key, p);
  }
  return p;
}
