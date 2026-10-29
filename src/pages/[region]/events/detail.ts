import type { APIRoute } from 'astro';

export const prerender = false;

/** The old event link, /event/<region>/events/detail?id=<id>: an event is now /event/<region>/<id>. */
export const GET: APIRoute = ({ params, url, redirect }) => {
  const region = (params.region ?? '').toLowerCase();
  const id = url.searchParams.get('id');
  return redirect(`/event/${region}${id ? `/${encodeURIComponent(id)}` : ''}`, 301);
};
