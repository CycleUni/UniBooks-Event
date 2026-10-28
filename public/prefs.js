/*
 * Region and language, as on the main UniBooks site.
 *
 * The regions, and the languages each one is offered in, come from the main
 * site's database (its public GET /api/v1/core/regions on this same origin).
 * The choices are the main site's own localStorage keys (`region`, lower-case
 * code; `lang`), so both sites follow one setting. The footer menus copy the
 * main site's ui-prefs-selector: a bordered field with an icon, the current
 * choice and a caret, opening a card of options with a check on the current one.
 */
(function () {
  var LANG_LABELS = { 'zh-TW': '中文 (繁體)', 'zh-HK': '中文 (香港)', en: 'English' };
  // Only for when the main site cannot be reached: its seeded regions.
  var FALLBACK = [
    { code: 'TW', name: 'Taiwan', localized_name: '台灣', languages: ['zh-TW', 'en'], default_language: 'zh-TW' },
    { code: 'HK', name: 'Hong Kong', localized_name: '香港', languages: ['zh-HK', 'en'], default_language: 'zh-HK' },
  ];
  var byLang = {};

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* the choice lasts this page only */ }
  }

  /** The regions, named in `lang` (default: the current language). */
  window.__eventRegions = function (lang) {
    lang = lang || window.__getLang();
    if (!byLang[lang]) {
      byLang[lang] = fetch('/api/v1/core/regions?lang=' + encodeURIComponent(lang), { credentials: 'same-origin' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (list) { return Array.isArray(list) && list.length ? list : FALLBACK; })
        .catch(function () { return FALLBACK; })
        .then(function (list) {
          // __getLang falls back to the region's default language.
          list.forEach(function (r) { window.__regionDefaultLang[r.code.toLowerCase()] = r.default_language; });
          return list;
        });
    }
    return byLang[lang];
  };

  /**
   * The regions the signed-in staff member may manage, as the main site
   * grants them: all for an admin, their managed regions for other staff.
   * The admin pages offer only these.
   */
  window.__eventManageableRegions = async function () {
    var regions = await window.__eventRegions();
    var who = window.__eventWho ? await window.__eventWho() : {};
    var allowed = who.user && who.user.managedRegions;
    if (!who.user || allowed === null || allowed === undefined) return regions;
    return regions.filter(function (r) { return allowed.indexOf(r.code.toUpperCase()) >= 0; });
  };

  /** A region's name for display, from the list. */
  window.__regionName = function (regions, code) {
    var c = String(code || '').toUpperCase();
    for (var i = 0; i < regions.length; i++) {
      if (regions[i].code.toUpperCase() === c) return regions[i].localized_name || regions[i].name;
    }
    return c;
  };

  // --- Footer menus --------------------------------------------------------

  var openMenu = null;

  function close() {
    if (!openMenu) return;
    openMenu.panel.remove();
    openMenu.trigger.setAttribute('aria-expanded', 'false');
    openMenu = null;
  }

  var CHECK = '<svg class="ub-dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var CARET = '<svg class="ub-dd-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  var GLOBE = '<svg class="ub-dd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
  var LANG_ICON = '<span class="ub-dd-icon ub-dd-lang-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><text x="1" y="15" font-family="inherit" font-size="13" font-weight="500" fill="var(--ink)">文</text><text x="11" y="19" font-family="inherit" font-size="10" font-weight="700" fill="var(--accent)">A</text></svg></span>';

  /**
   * One menu: `options` [{ value, label }], the current `value`, and `onPick`.
   * Static markup (icons) uses innerHTML; every label goes in as text.
   */
  function menu(iconHtml, ariaLabel, options, value, onPick) {
    var wrap = document.createElement('div');
    wrap.className = 'ub-dd';
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ub-dd-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', ariaLabel);
    trigger.innerHTML = iconHtml;
    var current = options.filter(function (o) { return o.value === value; })[0];
    var label = document.createElement('span');
    label.className = 'ub-dd-label';
    label.textContent = current ? current.label : '';
    trigger.appendChild(label);
    trigger.insertAdjacentHTML('beforeend', CARET);
    wrap.appendChild(trigger);

    function open() {
      close();
      var panel = document.createElement('div');
      panel.className = 'ub-dd-panel';
      var list = document.createElement('ul');
      list.className = 'ub-dd-list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', ariaLabel);
      options.forEach(function (o) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.tabIndex = -1;
        var isCurrent = o.value === value;
        li.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
        if (isCurrent) li.className = 'active';
        var text = document.createElement('span');
        text.textContent = o.label;
        li.appendChild(text);
        if (isCurrent) li.insertAdjacentHTML('beforeend', CHECK);
        li.addEventListener('click', function () {
          close();
          trigger.focus();
          if (o.value !== value) onPick(o.value);
        });
        li.addEventListener('keydown', function (e) {
          var items = Array.prototype.slice.call(list.children);
          var i = items.indexOf(li);
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
          else if (e.key === 'Tab') { close(); }
        });
        list.appendChild(li);
      });
      panel.appendChild(list);
      document.body.appendChild(panel);

      // Above the trigger, right edges aligned (the footer sits at the page's foot).
      var r = trigger.getBoundingClientRect();
      var w = Math.max(200, panel.offsetWidth);
      panel.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
      var top = r.top - panel.offsetHeight - 4;
      panel.style.top = (top >= 8 ? top : r.bottom + 4) + 'px';

      trigger.setAttribute('aria-expanded', 'true');
      openMenu = { panel: panel, trigger: trigger };
      (list.querySelector('.active') || list.firstChild).focus();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openMenu && openMenu.trigger === trigger) close();
      else open();
    });
    return wrap;
  }

  document.addEventListener('click', function (e) {
    if (openMenu && !openMenu.panel.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openMenu) {
      var t = openMenu.trigger;
      close();
      t.focus();
    }
  });
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);

  function setLang(lang) {
    store('lang', lang);
    if (window.__applyTranslations) window.__applyTranslations();
    window.dispatchEvent(new CustomEvent('ub-lang-changed', { detail: { lang: lang } }));
  }

  function setRegion(region, regions) {
    store('region', region);
    // As the main site: a language the new region does not offer gives way to its default.
    var info = regions.filter(function (r) { return r.code.toLowerCase() === region; })[0];
    var lang = window.__getLang();
    if (info && info.languages && info.languages.indexOf(lang) < 0) store('lang', info.default_language);

    // A public page lives under its region: go to the same page in the other one.
    var m = location.pathname.match(/^\/event\/([a-z]{2})(\/.*)?$/);
    if (m) {
      location.assign('/event/' + region + (m[2] || '') + location.search + location.hash);
      return;
    }
    if (window.__applyTranslations) window.__applyTranslations();
    window.dispatchEvent(new CustomEvent('ub-region-changed', { detail: { region: region } }));
    render();
  }

  async function render() {
    var host = document.getElementById('footer-prefs');
    if (!host) return;
    var lang = window.__getLang();
    var onAdmin = location.pathname.indexOf('/event/admin') === 0;
    var regions = onAdmin ? await window.__eventManageableRegions() : await window.__eventRegions(lang);
    var region = window.__getRegion();
    if (onAdmin && regions.length && !regions.some(function (r) { return r.code.toLowerCase() === region; })) {
      // A region this staff member does not manage: move to one they do.
      setRegion(regions[0].code.toLowerCase(), regions);
      return;
    }
    var info = regions.filter(function (r) { return r.code.toLowerCase() === region; })[0];
    var langs = (info && info.languages) || Object.keys(LANG_LABELS);
    if (langs.indexOf(lang) < 0 && info) {
      // The stored language is not offered here: use the region's default, as the main site does.
      setLang(info.default_language); // its ub-lang-changed renders again
      return;
    }

    var t = window.__t;
    var regionMenu = menu(
      GLOBE,
      t('nav.regionSwitcher'),
      regions.map(function (r) { return { value: r.code.toLowerCase(), label: r.localized_name || r.name }; }),
      region,
      function (v) { setRegion(v, regions); },
    );
    var langMenu = menu(
      LANG_ICON,
      t('nav.languageSwitcher'),
      langs.filter(function (l) { return LANG_LABELS[l]; }).map(function (l) { return { value: l, label: LANG_LABELS[l] }; }),
      lang,
      setLang,
    );
    host.replaceChildren(regionMenu, langMenu);
  }

  window.addEventListener('ub-lang-changed', function () { render(); });
  // Who is signed in decides the admin pages' regions: ask again after a renewed session.
  window.addEventListener('ub-session-changed', function () { render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
