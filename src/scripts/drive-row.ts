/**
 * A book drive as a row of a list (a region's book drives page, for those who
 * run them): its title, its organization and counts underneath, its status on
 * the right; it opens the drive's page.
 */

import { regionPath } from './region-path';

export interface DriveSummary {
  id: string;
  title: string;
  status: string;
  organization?: { display_name: string };
  counts?: { copies: number; in_stock: number; staff: number };
}

/** A drive status as a badge: collecting is the one that needs people. */
export function driveStatusBadge(status: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = status === 'closed' ? 'badge badge-neutral' : 'badge badge-success';
  badge.textContent = window.__t(`drive.status.${status}`);
  return badge;
}

export function driveRow(d: DriveSummary): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'list-row';
  a.href = regionPath(`/drives/${encodeURIComponent(d.id)}`);
  const main = document.createElement('span');
  const title = document.createElement('strong');
  title.style.display = 'block';
  title.textContent = d.title;
  const sub = document.createElement('span');
  sub.className = 'list-row-sub';
  sub.textContent = [
    d.organization?.display_name,
    d.counts ? window.__t('drive.copiesCount', { n: d.counts.copies }) : '',
    d.counts ? window.__t('drive.staffCount', { n: d.counts.staff }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  main.appendChild(title);
  main.appendChild(sub);
  a.appendChild(main);
  a.appendChild(driveStatusBadge(d.status));
  li.appendChild(a);
  return li;
}
