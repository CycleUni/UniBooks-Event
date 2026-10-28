import { DEFAULT_LANG, SUPPORTED_LANGS, type Lang } from './config';
import { en } from './translations/en';
import { zhTW } from './translations/zh-TW';
import { zhHK } from './translations/zh-HK';

export const translations: Record<Lang, Record<string, string>> = {
  'zh-TW': zhTW,
  'zh-HK': zhHK,
  en,
};

export function useTranslations(lang: Lang = DEFAULT_LANG) {
  const dict = translations[lang] || translations[DEFAULT_LANG];
  return function t(key: string, params?: Record<string, string | number>): string {
    let str = dict[key] || translations[DEFAULT_LANG][key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  };
}

export function useTranslatedPath(_lang?: Lang) {
  return function tp(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `/event${cleanPath === '/' ? '' : cleanPath}`;
  };
}

export function eventPath(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `/event${cleanPath === '/' ? '' : cleanPath}`;
}
