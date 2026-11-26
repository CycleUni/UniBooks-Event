import { mainFetch } from './main-site';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'staff' | 'admin';
  isStaff: boolean;
  isAdmin: boolean;
  /**
   * The regions this staff member manages, upper-case, as the main site grants
   * them (staff_managed_regions); null for an admin, who manages every region.
   */
  managedRegions: string[] | null;
  /** The language saved on the account (the main site's site_language), or ''. */
  siteLanguage: string;
  /** The region saved on the account, lower-case, or '' (the main site's site_region). */
  siteRegion: string;
  /**
   * The student organizations this account runs (the main site's /auth/me
   * `organizations`): their admin pages here are open to them whether or not
   * they are staff.
   */
  organizations: OrganizationRef[];
  /** The open book drives this account works as staff (the main site's `staffed_drives`). */
  staffedDrives: StaffedDrive[];
}

export interface StaffedDrive {
  id: string;
  title: string;
  status: string;
  /** Upper-case region code. */
  region: string;
  organizationName: string;
}

export interface OrganizationRef {
  id: string;
  /** Upper-case region code. */
  region: string;
  name: string;
  /** "<school name> <name>", in the account's language. */
  displayName: string;
}

/** The main site's access-token cookie (its server/src/lib/session.ts ACCESS_COOKIE). */
const ACCESS_COOKIE = '__Host-ub_at';

/**
 * The person signed in to the main site, as the main site says (its
 * /api/v1/auth/me, with this request's cookie). Null when nobody is, or
 * their access token has run out: the page refreshes it and asks again.
 * Without the access cookie the answer is already known, so the main site is
 * not asked: analytics cookies alone used to cost it a Worker request.
 */
export async function authenticateRequest(request: Request, env: CloudflareEnv): Promise<AuthUser | null> {
  const cookie = request.headers.get('Cookie') ?? '';
  if (!cookie.split(';').some((part) => part.trim().startsWith(`${ACCESS_COOKIE}=`))) return null;
  const res = await mainFetch(env, request, '/api/v1/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`main site /auth/me answered ${res.status}`);

  const me = (await res.json()) as {
    id: string;
    email: string;
    display_name?: string;
    role: AuthUser['role'];
    managed_regions?: string[];
    site_language?: string;
    site_region?: string;
    organizations?: { id: string; region: string; name: string; display_name: string }[];
    staffed_drives?: { id: string; title: string; status: string; region: string; organization: { display_name: string } }[];
  };
  return {
    id: String(me.id),
    email: me.email,
    name: me.display_name ?? '',
    role: me.role,
    isStaff: me.role === 'staff' || me.role === 'admin',
    isAdmin: me.role === 'admin',
    managedRegions: me.role === 'admin' ? null : (me.managed_regions ?? []).map((r) => r.toUpperCase()),
    siteLanguage: me.site_language ?? '',
    siteRegion: (me.site_region ?? '').toLowerCase(),
    organizations: (me.organizations ?? []).map((o) => ({
      id: o.id,
      region: o.region.toUpperCase(),
      name: o.name,
      displayName: o.display_name,
    })),
    staffedDrives: (me.staffed_drives ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      region: d.region.toUpperCase(),
      organizationName: d.organization.display_name,
    })),
  };
}
