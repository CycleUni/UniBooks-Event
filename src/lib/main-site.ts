/**
 * Requests to the main site's API on behalf of the person using this page.
 * In production they go through the MAIN service binding; under `astro dev`
 * they go to this origin, which the dev server passes on to the main site's
 * dev server (astro.config.mjs). Either way the main site sees a same-origin
 * request carrying the browser's own session cookie, so it decides who that is.
 */
export async function mainFetch(
  env: CloudflareEnv,
  incoming: Request,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const origin = new URL(incoming.url).origin;
  const headers = new Headers({ Origin: origin, Accept: 'application/json' });
  for (const name of ['Cookie', 'CF-Connecting-IP']) {
    const value = incoming.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');

  const request = new Request(`${origin}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (import.meta.env.DEV) return fetch(request);
  if (!env.MAIN) throw new Error('The MAIN service binding is not configured');
  return env.MAIN.fetch(request);
}
