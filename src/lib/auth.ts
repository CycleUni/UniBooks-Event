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
}

/**
 * The person signed in to the main site, as the main site says (its
 * /api/v1/auth/me, with this request's cookie). Null when nobody is, or
 * their access token has run out: the page refreshes it and asks again.
 */
export async function authenticateRequest(request: Request, env: CloudflareEnv): Promise<AuthUser | null> {
  if (!request.headers.get('Cookie')) return null;
  const res = await mainFetch(env, request, '/api/v1/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`main site /auth/me answered ${res.status}`);

  const me = (await res.json()) as {
    id: string;
    email: string;
    display_name?: string;
    role: AuthUser['role'];
    managed_regions?: string[];
  };
  return {
    id: String(me.id),
    email: me.email,
    name: me.display_name ?? '',
    role: me.role,
    isStaff: me.role === 'staff' || me.role === 'admin',
    isAdmin: me.role === 'admin',
    managedRegions: me.role === 'admin' ? null : (me.managed_regions ?? []).map((r) => r.toUpperCase()),
  };
}
