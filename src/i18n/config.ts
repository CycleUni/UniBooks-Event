export type Lang = 'zh-TW' | 'zh-HK' | 'en';

export const DEFAULT_LANG: Lang = 'zh-TW';
export const SUPPORTED_LANGS: readonly Lang[] = ['zh-TW', 'zh-HK', 'en'];

// Regions are not listed here: they are the main site's, from its database (public/prefs.js, src/lib/regions.ts).
