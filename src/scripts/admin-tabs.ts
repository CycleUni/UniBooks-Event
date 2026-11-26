/**
 * The back office (後台管理, /event/admin) and its tabs
 * (src/components/AdminTabs.astro): staff get the student organizations, an
 * organization's admins its member roster.
 */
export interface BackOfficeUser {
  isStaff: boolean;
  organizations?: unknown[];
}

/** Whether this person has a back office at all. */
export function hasBackOffice(user: BackOfficeUser): boolean {
  return user.isStaff || (user.organizations ?? []).length > 0;
}

/** The back office's first page for this person: the organizations for staff, else the roster. */
export function backOfficeHome(user: BackOfficeUser): string {
  return user.isStaff ? '/event/admin/orgs' : '/event/admin/roster';
}

export function showAdminTabs(user: BackOfficeUser): void {
  const runsOrgs = (user.organizations ?? []).length > 0;
  document.querySelectorAll<HTMLElement>('.admin-tab').forEach((tab) => {
    tab.hidden = !(tab.dataset.tabWho === 'staff' ? user.isStaff : runsOrgs);
  });
}
