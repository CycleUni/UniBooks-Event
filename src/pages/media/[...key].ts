export const prerender = false;

import type { APIRoute } from 'astro';
import { contentTypeOf, isMediaKey } from '../../lib/media';

/** An uploaded image, from this system's bucket. Keys are random and never reused, so the response can be cached for good. */
export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.key ?? '';
  const bucket = locals.runtime?.env?.MEDIA;
  if (!isMediaKey(key) || !bucket) return new Response(null, { status: 404 });
  const object = await bucket.get(key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': contentTypeOf(key),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
      // Shown as an image only, never interpreted as anything else.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
};
