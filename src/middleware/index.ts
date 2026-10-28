import { defineMiddleware } from 'astro:middleware';
import { SUPPORTED_LANGS, type Lang } from '../i18n/config';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = new URL(context.request.url);
  if (pathname.startsWith('/event/api/') || pathname.startsWith('/event/_astro/') || pathname.includes('.')) {
    return next();
  }

  // Old links carried the language in the path (/event/zh-TW/admin): drop it.
  const segments = pathname.replace(/^\/event/, '').split('/').filter(Boolean);
  if (segments.length > 0 && SUPPORTED_LANGS.includes(segments[0] as Lang)) {
    const rest = segments.slice(1).join('/');
    return context.redirect(`/event${rest ? `/${rest}` : ''}${search}`, 301);
  }

  return next();
});
