/**
 * What intake and the drive page share about a collected book: its condition
 * choices, the years it may suit, and reading an ISBN off a barcode.
 */

export const CONDITIONS = ['new', 'like_new', 'noted', 'damaged'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const GRADES = [1, 2, 3, 4, 5, 6, 7];

export interface DriveCopy {
  id: string;
  shelf_no: number;
  book: { id: string; title: string; authors: string; isbn13: string | null; cover_url: string } | null;
  condition: Condition;
  donor_student_number: string;
  donor_department: string;
  target_department: string;
  target_grade: number | null;
  status: 'in_stock' | 'allocated' | 'picked_up' | 'withdrawn';
  note: string;
  intake_by: string;
  created_at: string;
  warnings?: string[];
}

/** A shelf number as written on the book: #007. */
export function shelfLabel(n: number): string {
  return `#${String(n).padStart(3, '0')}`;
}

/** Fill a <select> with the years, after a "not given" choice. */
export function fillGradeSelect(select: HTMLSelectElement): void {
  select.replaceChildren(new Option(window.__t('org.gradeNone'), ''));
  for (const g of GRADES) select.appendChild(new Option(window.__t('org.gradeN', { n: g }), String(g)));
}

/** Fill a <select> with the conditions. */
export function fillConditionSelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  for (const c of CONDITIONS) select.appendChild(new Option(window.__t(`drive.condition.${c}`), c));
}

/**
 * The ISBN-13 a scanned or typed code is, or null. An ISBN-10 is turned into
 * its ISBN-13; the check digit must hold, so a misread barcode is not taken.
 */
export function readIsbn(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(s)) {
    const sum = [...s.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(s[12]) ? s : null;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const body = `978${s.slice(0, 9)}`;
    const check = (10 - ([...body].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10;
    return body + check;
  }
  return null;
}
