/// <reference types="astro/client" />

type CloudflareEnv = {
  DB: D1Database;
  /** This system's own image bucket (unibooks-event-assets). */
  MEDIA?: R2Bucket;
  /** The image bucket's public domain, e.g. https://event-assets.unibooks.app; unset: served under /event/media/. */
  R2_PUBLIC_URL?: string;
  /** The main site's Worker (service binding). */
  MAIN?: Fetcher;
};

declare namespace App {
  interface Locals {
    runtime: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
      cf: IncomingRequestCfProperties;
    };
    lang: 'zh-TW' | 'zh-HK' | 'en';
  }
}
