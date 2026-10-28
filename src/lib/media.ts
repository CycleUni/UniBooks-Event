/**
 * Images staff upload for events and prizes: this system's own R2 bucket
 * (binding MEDIA), served by this Worker under /event/media/ on the main
 * site's origin, so no public bucket domain is needed.
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

/** Whether `url` points at an uploaded image: `/event/media/<key>`. */
export function isMediaUrl(url: string): boolean {
  return url.startsWith(MEDIA_PATH) && isMediaKey(url.slice(MEDIA_PATH.length));
}

export function newMediaKey(ext: ImageExt): string {
  return `events/${crypto.randomUUID()}.${ext}`;
}
