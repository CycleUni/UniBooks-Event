/*
 * Sign-in for the admin pages, through the main site's session, without ever
 * looping between /event and /login.
 *
 * The main site's sign-in page sends someone it believes is signed in straight
 * back here. If this site still cannot see them (an expired session the main
 * site has not noticed, a refresh that is refused or rate-limited, the main
 * site down), redirecting again would bounce forever. So: renew the session at
 * most once a minute, send to sign-in at most once a minute, and when someone
 * comes straight back still signed out, stop and say so.
 */
(function () {
  var KEY = 'ub-event-auth';
  var WINDOW_MS = 60 * 1000;

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function write(state) {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: no memory, still no loop beyond one bounce */ }
  }
  function t(key) {
    return window.__t ? window.__t(key) : key;
  }

  /** { user } when the answer is known (user null = signed out), { error } when it is not. */
  async function askWho() {
    try {
      var res = await fetch('/event/api/me', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) return { user: null };
      if (!res.ok) return { error: true };
      var data = await res.json();
      return { user: data.user || null };
    } catch (e) {
      return { error: true };
    }
  }

  // The first answer is shared: the header and the page both ask on load.
  var firstWho = null;
  /** Who is signed in, without any redirect: { user } (null when signed out) or { error }. */
  window.__eventWho = function () {
    if (!firstWho) firstWho = askWho();
    return firstWho;
  };

  async function renew() {
    try {
      var res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function loginUrl() {
    return '/login?returnUrl=' + encodeURIComponent(location.pathname + location.search);
  }

  function showProblem(kind) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'alert');
    card.style.cssText = 'max-width:480px;margin:4rem auto;text-align:center;padding:var(--space-6) var(--space-5);';

    var title = document.createElement('h1');
    title.style.cssText = 'font-size:var(--text-xl);font-weight:700;color:var(--ink);margin-bottom:var(--space-2);';
    title.textContent = t(kind === 'stuck' ? 'session.stuckTitle' : 'session.unavailableTitle');

    var desc = document.createElement('p');
    desc.style.cssText = 'color:var(--muted);line-height:1.5;margin-bottom:var(--space-5);';
    desc.textContent = t(kind === 'stuck' ? 'session.stuckDesc' : 'session.unavailableDesc');

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:var(--space-3);justify-content:center;flex-wrap:wrap;';

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-primary';
    retry.textContent = t('session.retry');
    retry.addEventListener('click', function () {
      write({});
      location.reload();
    });
    actions.appendChild(retry);

    if (kind === 'stuck') {
      // Signing out first: otherwise the sign-in page would send them straight back.
      var again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn-secondary';
      again.textContent = t('session.signInAgain');
      again.addEventListener('click', async function () {
        again.disabled = true;
        try {
          await fetch('/api/v1/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
        } catch (e) { /* sign-in page will tell */ }
        write({});
        location.assign(loginUrl());
      });
      actions.appendChild(again);
    }

    card.append(title, desc, actions);
    (document.querySelector('main') || document.body).prepend(card);
  }

  /** For a page whose own loading failed: say so instead of redirecting. */
  window.__eventSessionProblem = function () {
    showProblem('unavailable');
  };

  /**
   * { state: 'ok', user } once someone is signed in; otherwise the page should
   * stop: it is being sent to sign-in, or a problem card is shown.
   */
  window.__eventSession = async function () {
    var who = await window.__eventWho();
    if (who.error) {
      showProblem('unavailable');
      return { state: 'unavailable' };
    }
    if (who.user) {
      write({});
      return { state: 'ok', user: who.user };
    }

    var now = Date.now();
    var state = read();
    // The 15-minute access cookie may just have run out: renew it, at most once a minute.
    if (!state.renewedAt || now - state.renewedAt > WINDOW_MS) {
      state.renewedAt = now;
      write(state);
      if (await renew()) {
        who = await askWho();
        if (who.user) {
          write({});
          // Whatever read the first, signed-out answer (the header, the region menu) reads this one now.
          firstWho = Promise.resolve(who);
          window.dispatchEvent(new CustomEvent('ub-session-changed'));
          return { state: 'ok', user: who.user };
        }
      }
    }

    // Straight back from sign-in, still signed out here, while the main site
    // believes the visitor is signed in (its ub_session hint): its sign-in
    // page would send them straight back again, so another redirect would loop.
    var mainThinksSignedIn = /(?:^|;\s*)ub_session=1(?:;|$)/.test(document.cookie);
    if (mainThinksSignedIn && state.loginAt && now - state.loginAt < WINDOW_MS) {
      showProblem('stuck');
      return { state: 'stuck' };
    }
    state.loginAt = now;
    write(state);
    location.replace(loginUrl());
    return { state: 'redirecting' };
  };
})();
