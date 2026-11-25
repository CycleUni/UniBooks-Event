/**
 * Show the back-office tabs this person may use (src/components/AdminTabs.astro):
 * the draws and the student organizations to staff, book drives to staff and
 * to anyone who runs an organization.
 */
export interface BackOfficeUser {
  isStaff: boolean;
  organizations?: unknown[];
}

export function showAdminTabs(user: BackOfficeUser): void {
  const runsOrgs = (user.organizations ?? []).length > 0;
  document.querySelectorAll<HTMLElement>('.admin-tab').forEach((tab) => {
    const who = tab.dataset.tabWho;
    tab.hidden = !(user.isStaff || (who === 'drives' && runsOrgs));
  });
}
