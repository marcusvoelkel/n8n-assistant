(() => {
  const LS = {
    get: (k, d=null) => { try { const v = localStorage.getItem(k); return v!=null ? JSON.parse(v) : d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // Theme
  const themeToggles = Array.from(document.querySelectorAll('[data-theme-toggle]'));
  function applyTheme(t) {
    const isDark = (t === 'dark');
    document.documentElement.classList.toggle('dark', isDark);
    // Explicit visual fallback to guarantee background switch
    if (document.body) {
      document.body.dataset.theme = isDark ? 'dark' : 'light';
    }
  }
  const savedTheme = LS.get('theme', 'dark');
  applyTheme(savedTheme);
  if (document.body) document.body.dataset.theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
  function updateThemeButtons() {
    const dark = document.documentElement.classList.contains('dark');
    themeToggles.forEach(btn => {
      btn.textContent = dark ? '☀︎' : '☾';
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = btn.getAttribute('aria-label');
    });
  }
  if (themeToggles.length) {
    updateThemeButtons();
    themeToggles.forEach(btn => btn.addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next); LS.set('theme', next); updateThemeButtons();
    }));
  }

  // Cookie banner (only necessary cookies: lang, consent)
  const cb = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept');
  if (cb && acceptBtn) {
    if (!LS.get('cookieConsent', false)) cb.classList.remove('hidden');
    acceptBtn.addEventListener('click', () => { LS.set('cookieConsent', true); cb.classList.add('hidden'); });
  }

  // Mobile menu toggle
  const menuBtn = document.getElementById('menu-toggle');
  const mobile = document.getElementById('mobile-menu');
  if (menuBtn && mobile) {
    const toggleMenu = () => {
      const isHidden = mobile.classList.toggle('hidden');
      menuBtn.setAttribute('aria-expanded', String(!isHidden));
    };
    menuBtn.addEventListener('click', toggleMenu);
    mobile.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { mobile.classList.add('hidden'); menuBtn.setAttribute('aria-expanded','false'); }));
  }

  // Store overlay (not yet in Chrome Web Store)
  const storeBtn = document.getElementById('cta-store');
  const storeOv = document.getElementById('store-ov');
  if (storeBtn && storeOv) {
    const close = storeOv.querySelector('[data-close]');
    storeBtn.addEventListener('click', (e) => { e.preventDefault(); storeOv.classList.remove('hidden'); });
    if (close) close.addEventListener('click', () => storeOv.classList.add('hidden'));
    storeOv.addEventListener('click', (e) => { if (e.target === storeOv) storeOv.classList.add('hidden'); });
  }

  // Smooth scroll for in-page anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Language toggle + external nav rewrite for imprint/privacy
  const langTgl = document.getElementById('lang-toggle');
  if (langTgl) {
    const rewriteNav = () => {
      const de = location.hash === '#de';
      langTgl.textContent = de ? 'EN' : 'DE';
      langTgl.setAttribute('aria-label', de ? 'English' : 'Deutsch');
      langTgl.href = de ? location.pathname : (location.pathname + '#de');
      const base = de ? '/de/' : '/';
      document.querySelectorAll('header nav a[href^="#"]').forEach(a => { a.href = base + a.getAttribute('href'); });
      const mm = document.getElementById('mobile-menu');
      if (mm) mm.querySelectorAll('a[href^="#"]').forEach(a => { a.href = base + a.getAttribute('href'); });
    };
    window.addEventListener('hashchange', rewriteNav);
    rewriteNav();
  }
  // Waitlist form
  const form = document.getElementById('waitlist-form');
  const note = document.getElementById('waitlist-note');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name')||''),
        email: String(fd.get('email')||''),
        message: String(fd.get('message')||''),
        consent: !!fd.get('consent')
      };
      if (!payload.email || !payload.consent) {
        note.textContent = note?.dataset?.msgInvalid || 'Please enter email and accept the privacy notice.';
        note.classList.remove('hidden');
        return;
      }
      try {
        const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          note.textContent = note?.dataset?.msgOk || 'Thanks! You are on the waitlist.';
          note.classList.remove('hidden');
          form.reset();
        } else {
          note.textContent = note?.dataset?.msgErr || 'Submission failed. Please try again later.';
          note.classList.remove('hidden');
        }
      } catch {
        note.textContent = note?.dataset?.msgErr || 'Submission failed. Please try again later.';
        note.classList.remove('hidden');
      }
    });
  }
})();
