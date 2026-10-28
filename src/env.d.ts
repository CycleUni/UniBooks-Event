/// <reference types="astro/client" />

type CloudflareEnv = {
  DB: D1Database;
  /** This system's own image bucket (unibooks-event-assets). */
  MEDIA?: R2Bucket;
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
