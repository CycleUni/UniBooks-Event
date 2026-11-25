/**
 * A department picker: the region's departments grouped by college (the main
 * site's metadata, the same list its search matches), and a last "Other"
 * choice that opens a text field for a department the list does not have.
 * The main site files what is typed under the listed name when it is one of
 * its spellings, so 資管 typed under Other still counts as 資訊管理學系.
 *
 * A search field above the list narrows it by name or short name (資管, IM),
 * and picks the department when only one is left. A department listed under
 * two colleges is offered once, under the first.
 */

import { regionMetadata } from './region-metadata';

const OTHER = '__other';

export interface DepartmentPicker {
  /** The chosen department, or what was typed under Other ('' for none). */
  value(): string;
  /** Show `name`: chosen in the list when it is there, else typed under Other. */
  set(name: string): void;
}

interface Dept {
  name: string;
  /** Name and short names, lower-cased without spaces, for the search field. */
  key: string;
  aliases: string[];
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, '');
/** Anywhere in the name, or the start of a short name: "im" finds IM, not Animal Science. */
const matches = (d: Dept, q: string) => d.key.includes(q) || d.aliases.some((a) => a.startsWith(q));

export async function departmentPicker(select: HTMLSelectElement, other: HTMLInputElement, region: string): Promise<DepartmentPicker> {
  const meta = await regionMetadata(region);
  const seen = new Set<string>();
  const colleges = (meta.categories ?? [])
    .map((c) => ({
      title: c.title,
      depts: (c.departments ?? [])
        .filter((d) => d.name && !seen.has(d.name) && seen.add(d.name))
        .map((d): Dept => ({ name: d.name, key: fold(d.name), aliases: (d.aliases ?? []).map(fold) })),
    }))
    .filter((c) => c.depts.length);

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'form-input';
  search.placeholder = window.__t('dept.search');
  search.setAttribute('aria-label', window.__t('dept.search'));
  search.autocomplete = 'off';
  search.style.marginBottom = 'var(--space-2)';
  select.insertAdjacentElement('beforebegin', search);

  /** List the departments matching `q` (all when empty); the chosen one stays listed. */
  const render = (q: string) => {
    const current = select.value;
    const groups: HTMLOptGroupElement[] = [];
    const found: string[] = [];
    for (const c of colleges) {
      const depts = c.depts.filter((d) => !q || d.name === current || matches(d, q));
      if (!depts.length) continue;
      const g = document.createElement('optgroup');
      g.label = c.title;
      for (const d of depts) {
        g.appendChild(new Option(d.name, d.name));
        if (!q || matches(d, q)) found.push(d.name);
      }
      groups.push(g);
    }
    select.replaceChildren(new Option(window.__t('dept.none'), ''), ...groups, new Option(window.__t('dept.other'), OTHER));
    select.value = current;
    return found;
  };
  render('');

  const sync = () => {
    const isOther = select.value === OTHER;
    other.hidden = !isOther;
    other.required = isOther;
  };
  select.addEventListener('change', () => {
    sync();
    if (select.value === OTHER) other.focus();
  });
  search.addEventListener('input', () => {
    const q = fold(search.value);
    const found = render(q);
    if (q && found.length === 1 && select.value !== found[0]) {
      select.value = found[0];
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  sync();

  const known = new Set(colleges.flatMap((c) => c.depts.map((d) => d.name)));
  return {
    value: () => (select.value === OTHER ? other.value.trim() : select.value),
    set(name: string) {
      search.value = '';
      render('');
      if (!name) select.value = '';
      else if (known.has(name)) select.value = name;
      else select.value = OTHER;
      other.value = select.value === OTHER ? name : '';
      sync();
    },
  };
}
