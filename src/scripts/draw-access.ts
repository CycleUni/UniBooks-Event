/**
 * Who runs a draw, as the pages see it (the API decides the same way, in
 * src/server/api.ts canManage): staff of its region, or an admin of the
 * student organization hosting it, while staff have opened draws to that
 * organization.
 */

export interface DrawOrg {
  id: string;
  /** Upper-case region code. */
  region: string;
  displayName: string;
  features: { draws: boolean; drives: boolean };
}

export interface DrawUser {
  isStaff: boolean;
  /** Upper-case; null for an admin, who manages every region. */
  managedRegions: string[] | null;
  organizations?: DrawOrg[];
}

export interface DrawRef {
  regionCode: string;
  organizationId?: string | null;
}

/** The organizations this account runs that may host draws. */
export function drawOrgs(user: DrawUser | null | undefined): DrawOrg[] {
  return (user?.organizations ?? []).filter((o) => o.features?.draws);
}

/** Whether this account runs draws anywhere: staff, or an admin of an organization with draws. */
export function runsDraws(user: DrawUser | null | undefined): boolean {
  return !!user?.isStaff || drawOrgs(user).length > 0;
}

/** Whether this account is staff who manage the region (upper-case code). */
export function staffManages(user: DrawUser | null | undefined, regionCode: string): boolean {
  return !!user?.isStaff && (user.managedRegions === null || user.managedRegions.includes(regionCode));
}

/** Whether this account may start a draw in the region: as its staff, or for an organization of its there. */
export function startsDraws(user: DrawUser | null | undefined, regionCode: string): boolean {
  return staffManages(user, regionCode) || drawOrgs(user).some((o) => o.region === regionCode);
}

/** Whether this account runs this draw. */
export function canManageDraw(user: DrawUser | null | undefined, event: DrawRef): boolean {
  if (event.organizationId && drawOrgs(user).some((o) => o.id === event.organizationId)) return true;
  return staffManages(user, event.regionCode);
}

/**
 * The names of the organizations hosting these draws, {id: "致理科技大學 學生會"},
 * in the page's language; {} when there are none or the main site is not answering.
 */
export async function hostNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return {};
  try {
    const q = new URLSearchParams({ ids: unique.join(','), lang: window.__getLang() });
    const res = await fetch(`/api/v1/orgs/names?${q}`);
    return res.ok ? ((await res.json()) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
