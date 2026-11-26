/**
 * Which of the organizations an account runs the book drives page is
 * showing: the one picked last on this browser, else the first. Kept in
 * localStorage as a convenience only; the main site decides what may be seen.
 */

export interface OrgRef {
  id: string;
  region: string;
  name: string;
  displayName: string;
}

const KEY = 'ub-event-org';

export function currentOrg(orgs: OrgRef[]): OrgRef {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: the first organization it is.
  }
  return orgs.find((o) => o.id === saved) ?? orgs[0];
}

export function rememberOrg(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
