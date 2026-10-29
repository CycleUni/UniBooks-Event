import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * The old admin links: /event/admin/events/edit?id=<id> and .../scanner?id=<id>
 * are now /event/admin/<id>/edit and /event/admin/<id>/scanner, .../new is /event/admin/new.
 */
export const GET: APIRoute = ({ params, url, redirect }) => {
  const page = params.page ?? '';
  const id = url.searchParams.get('id');
  if (page === 'new') return redirect('/event/admin/new/', 301);
  if ((page === 'edit' || page === 'scanner') && id) return redirect(`/event/admin/${encodeURIComponent(id)}/${page}`, 301);
  return redirect('/event/admin/', 301);
};
