/**
 * Ask before a destructive step, in the page's <ConfirmDialog />. The action
 * runs while the dialog is open; when it answers with a message (why it
 * failed) the dialog stays open to show it, otherwise it closes. Esc and
 * Cancel close it and give focus back to what opened it.
 */

let action: (() => Promise<string | null>) | null = null;
let trigger: HTMLElement | null = null;
let wired = false;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function isConfirmOpen(): boolean {
  return el('confirm-modal').style.display === 'flex';
}

export function closeConfirm(): void {
  el('confirm-modal').style.display = 'none';
  action = null;
  trigger?.focus?.();
}

function wire() {
  if (wired) return;
  wired = true;
  el('confirm-modal-cancel').addEventListener('click', closeConfirm);
  el('confirm-modal-action').addEventListener('click', async () => {
    if (!action) return;
    const btn = el<HTMLButtonElement>('confirm-modal-action');
    btn.disabled = true;
    const failure = await action().catch(() => window.__t('common.error'));
    if (failure) {
      el('confirm-modal-error').textContent = failure;
      el('confirm-modal-error').style.display = 'block';
      btn.disabled = false;
    } else closeConfirm();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isConfirmOpen()) closeConfirm();
  });
}

export function confirmAction(title: string, message: string, actionText: string, onConfirm: () => Promise<string | null>): void {
  wire();
  trigger = document.activeElement as HTMLElement | null;
  el('confirm-modal-title').textContent = title;
  el('confirm-modal-desc').textContent = message;
  el('confirm-modal-error').style.display = 'none';
  const btn = el<HTMLButtonElement>('confirm-modal-action');
  btn.textContent = actionText;
  btn.disabled = false;
  action = onConfirm;
  el('confirm-modal').style.display = 'flex';
  el('confirm-modal-cancel').focus();
}
