/**
 * People on something (an organization's admins, a drive's staff), shown as
 * chips: name, masked email, and a button to remove them.
 */

export interface Person {
  id: string;
  email: string;
  display_name: string;
}

/** Enough of an address to tell two accounts apart, not enough to mail it: ab•••@school.edu.tw. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

/** A .chip-list of `people`, or `emptyText` when there are none. `onRemove` runs from each chip's ×. */
export function personChips(people: Person[], emptyText: string, onRemove: (p: Person) => void): HTMLElement {
  const list = document.createElement('div');
  list.className = 'chip-list';
  if (!people.length) {
    const none = document.createElement('span');
    none.style.cssText = 'color: var(--muted); font-size: var(--text-sm);';
    none.textContent = emptyText;
    list.appendChild(none);
  }
  for (const p of people) {
    const chip = document.createElement('span');
    chip.className = 'person-chip';
    const who = document.createElement('span');
    who.textContent = p.display_name;
    const mail = document.createElement('small');
    mail.textContent = maskEmail(p.email);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.setAttribute('aria-label', window.__t('people.remove', { name: p.display_name }));
    remove.textContent = '×';
    remove.addEventListener('click', () => onRemove(p));
    chip.appendChild(who);
    chip.appendChild(mail);
    chip.appendChild(remove);
    list.appendChild(chip);
  }
  return list;
}

/**
 * An .inline-add form: an email field and a button. `onAdd` gets the address
 * and answers with what went wrong, or null; the error shows under the form.
 */
export function addPersonForm(buttonText: string, onAdd: (email: string) => Promise<string | null>): HTMLElement {
  const wrap = document.createElement('div');
  const form = document.createElement('form');
  form.className = 'inline-add';
  form.noValidate = true;
  const email = document.createElement('input');
  email.type = 'email';
  email.className = 'form-input';
  email.placeholder = window.__t('people.email');
  email.setAttribute('aria-label', window.__t('people.email'));
  email.autocomplete = 'off';
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn-secondary';
  btn.textContent = buttonText;
  form.appendChild(email);
  form.appendChild(btn);
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  error.style.cssText = 'display: none; color: var(--flag); font-size: var(--text-sm); margin: calc(-1 * var(--space-2)) 0 var(--space-3);';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = email.value.trim();
    if (!value) return;
    btn.disabled = true;
    error.style.display = 'none';
    const failure = await onAdd(value);
    btn.disabled = false;
    if (failure) {
      error.textContent = failure;
      error.style.display = 'block';
    }
  });
  wrap.appendChild(form);
  wrap.appendChild(error);
  return wrap;
}
