/**
 * Images staff upload for events and prizes: this system's own R2 bucket
 * (binding MEDIA). As on the main site, they are read from the bucket's public
 * domain (R2_PUBLIC_URL), so a view costs no Worker request and the CDN caches
 * it. Without one (local dev, where the bucket is wrangler's simulator) this
 * Worker serves them under /event/media/.
 */
export const MEDIA_PATH = '/event/media/';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
} as const;
export type ImageExt = keyof typeof TYPES;

const KEY_RE = /^events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/;

/**
 * The image format, read from the file's own first bytes rather than its name
 * or the declared type, or null when it is not one of the accepted formats
 * (SVG and anything else that could carry script is refused).
 */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((ch) => ch.charCodeAt(0)));
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'gif';
  if (ascii(4, 'ftypavif') || ascii(4, 'ftypavis')) return 'avif';
  return null;
}

export function contentTypeOf(key: string): string {
  return TYPES[key.slice(key.lastIndexOf('.') + 1) as ImageExt];
}

/** Whether `key` is one this system wrote (and so may be served). */
export function isMediaKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Where uploaded images are read, without a trailing slash. */
export function mediaBase(env: { R2_PUBLIC_URL?: string }): string {
  const publicUrl = import.meta.env.DEV ? '' : env.R2_PUBLIC_URL;
  return (publicUrl || MEDIA_PATH).replace(/\/+$/, '');
}

export function mediaUrl(env: { R2_PUBLIC_URL?: string }, key: string): string {
  return `${mediaBase(env)}/${key}`;
}

/**
 * Whether `url` claims to be an uploaded image: on the public domain or under
 * /event/media/. Either is accepted, so images saved before the setting
 * changed keep working.
 */
export function isMediaUrl(env: { R2_PUBLIC_URL?: string }, url: string): boolean {
  return [`${mediaBase(env)}/`, MEDIA_PATH].some((prefix) => url.startsWith(prefix));
}

/** Whether a URL that isMediaUrl names one of this system's keys. */
export function isValidMediaUrl(env: { R2_PUBLIC_URL?: string }, url: string): boolean {
  for (const prefix of [`${mediaBase(env)}/`, MEDIA_PATH]) {
    if (url.startsWith(prefix) && isMediaKey(url.slice(prefix.length))) return true;
  }
  return false;
}

export function newMediaKey(ext: ImageExt): string {
  return `events/${crypto.randomUUID()}.${ext}`;
}
