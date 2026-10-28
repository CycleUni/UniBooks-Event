export const prerender = false;

import type { APIRoute } from 'astro';
import { rootApp } from '../../server/api';

export const ALL: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime?.env || ({} as any);
    const ctx = context.locals.runtime?.ctx || ({} as any);
    return await rootApp.fetch(context.request, env, ctx);
  } catch (err: any) {
    console.error('API Route Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
