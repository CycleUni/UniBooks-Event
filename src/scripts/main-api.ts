/**
 * Calls from this system's admin pages to the main site's API. The pages share
 * its origin (unibooks.app), so the browser sends the visitor's own session
 * cookie and the main site decides what they may do: book drives and rosters
 * live there (the main site's docs/plans/2026-11-25-book-drive.md).
 */

declare global {
  interface Window {
    __t(key: string, params?: Record<string, string | number>): string;
    __getLang(): string;
    __getRegion(): string;
    __eventRegions(): Promise<{ code: string; name: string; localized_name?: string }[]>;
    __regionName(regions: { code: string }[], code: string): string;
    __eventSession(): Promise<{ state: string; user?: unknown }>;
    __eventSessionProblem(): void;
  }
}

export class MainApiError extends Error {
  constructor(
    readonly status: number,
    /** The main site's error code, an i18n key (`org.errGrade`), or '' when there was none. */
    readonly code: string,
    readonly body: Record<string, unknown>,
  ) {
    super(code || `HTTP ${status}`);
  }

  /** Per-field error codes of a validation error: {field: [code]}. */
  get fields(): Record<string, string[]> {
    return ((this.body.error as Record<string, unknown> | undefined)?.fields as Record<string, string[]>) ?? {};
  }
}

/** The path with the page language added (?lang=), so names come back in it, as the main app's requests do. */
function withLang(path: string): string {
  const url = new URL(`/api/v1${path}`, location.origin);
  if (!url.searchParams.has('lang')) url.searchParams.set('lang', window.__getLang());
  return url.pathname + url.search;
}

async function send(path: string, method: string, body: unknown): Promise<Response> {
  return fetch(withLang(path), {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * The main site's answer as JSON. A 401 means the 15-minute access cookie ran
 * out while the page was open: the session is renewed once (or the visitor
 * sent to sign in) and the call repeated.
 */
export async function mainApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  let res = await send(path, method, init.body);
  if (res.status === 401) {
    const session = await window.__eventSession();
    if (session.state === 'ok') res = await send(path, method, init.body);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String((data.error as Record<string, unknown> | undefined)?.code ?? '');
    throw new MainApiError(res.status, code, data);
  }
  return data as T;
}

/** A sentence for an error code: its translation here, else the generic error. */
export function errorText(code: string, params?: Record<string, string | number>): string {
  const text = code ? window.__t(code, params) : '';
  return text && text !== code ? text : window.__t('common.error');
}

/** What to tell the visitor about a failed call. */
export function apiErrorText(err: unknown): string {
  if (err instanceof MainApiError) return errorText(err.code, err.body.error as Record<string, string | number>);
  return window.__t('common.error');
}
