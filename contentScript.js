// Content script: injects a floating chat widget into n8n pages
// uses shadow DOM to isolate styles

(function () {
  const NS = 'n8n-ai-assistant';
  let state = {
    isOpen: false,
    messages: [],
    currentChatKey: '',
    settings: null,
    lastErrors: [],
    inputFocused: false,
  };

  // Utility: promisified chrome.storage get/set (fault-tolerant)
  function isExtContextValid() {
    try { return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }
  const storage = {
    get: (keys) => new Promise((resolve) => {
      if (!isExtContextValid() || !chrome.storage?.sync?.get) return resolve({});
      try { chrome.storage.sync.get(keys, (res) => resolve(res || {})); } catch { resolve({}); }
    }),
    set: (obj) => new Promise((resolve) => {
      if (!isExtContextValid() || !chrome.storage?.sync?.set) return resolve();
      try { chrome.storage.sync.set(obj, () => resolve()); } catch { resolve(); }
    }),
    getLocal: (keys) => new Promise((resolve) => {
      if (!isExtContextValid() || !chrome.storage?.local?.get) return resolve({});
      try { chrome.storage.local.get(keys, (res) => resolve(res || {})); } catch { resolve({}); }
    }),
    setLocal: (obj) => new Promise((resolve) => {
      if (!isExtContextValid() || !chrome.storage?.local?.set) return resolve();
      try { chrome.storage.local.set(obj, () => resolve()); } catch { resolve(); }
    }),
    removeLocal: (keys) => new Promise((resolve) => {
      if (!isExtContextValid() || !chrome.storage?.local?.remove) return resolve();
      try { chrome.storage.local.remove(keys, () => resolve()); } catch { resolve(); }
    }),
  };

  // Global-safe input focus helper (works across scopes)
  function focusAssistantInputSoon() {
    try {
      const sh = document.getElementById(`${NS}-root`)?.shadowRoot;
      const input = sh?.getElementById(`${NS}-input`);
      if (!input) return;
      try { input.focus(); } catch {}
      setTimeout(() => { try { input.focus(); } catch {} }, 0);
      try {
        input.style.height = 'auto';
        const max = 140;
        const h = Math.min(max, input.scrollHeight);
        input.style.height = h + 'px';
      } catch {}
    } catch {}
  }

  function matchesAllowedSite(url, patterns) {
    if (!patterns || patterns.length === 0) {
      // fallback heuristic: URLs containing 'n8n' or paths typical of editor
      return /n8n/i.test(url) || /(\/workflow|\/editor|\/#\/workflow)/i.test(url);
    }
    try {
      return patterns.some((p) => {
        // *.example.com or substring contains when no wildcard
        if (p.includes('*')) {
          // convert to regex
          const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          const re = new RegExp('^' + escaped + '$');
          return re.test(new URL(url).host) || re.test(url);
        }
        return url.includes(p);
      });
    } catch (e) {
      return false;
    }
  }

  function getHost() {
    try { return new URL(location.href).host; } catch { return null; }
  }

  function getForceKey() {
    const host = getHost();
    return host ? `${NS}:force:${host}` : `${NS}:force:global`;
  }

  function ensureInjected() {
    if (document.getElementById(`${NS}-root`)) return; // already injected

    const root = document.createElement('div');
    root.id = `${NS}-root`;
    const shadow = root.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .fab { position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%;
        background: #ED7863; color: #ffffff !important; display: flex; align-items: center; justify-content: center;
        font: 600 28px/1 sans-serif; cursor: pointer; box-shadow: none; border: none; outline: none; z-index: 2147483647; opacity: 0.85; filter: brightness(1.1) contrast(1.2); }
      .fab:hover { filter: brightness(0.95); }
      .panel { position: fixed; right: 20px; bottom: 80px; width: 410px; max-height: 70vh; display: none;
        background: #2b2b2b; color: #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,0.32);
        z-index: 2147483647; border: 1px solid #3a3a3a; opacity: 0.85; }
      .panel.open { display: flex; flex-direction: column; }
      .header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #1f1f1f; }
      .title { font: 600 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .actions { display: flex; gap: 8px; align-items: center; }
      .btn { background: transparent; border: 1px solid #3a3a3a; color: #e5e7eb; border-radius: 8px; padding: 6px 8px; cursor: pointer; font: 600 11px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .btn.icon { width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; }
      .btn.icon svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .btn:hover { background: #2a2a2a; }
      .close { background: transparent; border: none; color: #9ca3af; cursor: pointer; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
      .close:hover { color: #e5e7eb; }
      .close svg { width: 16px; height: 16px; }
      .quick { display: flex; gap: 6px; padding: 6px 10px; border-bottom: 1px solid #3a3a3a; background: #232323; flex-wrap: wrap; }
      .chip { background: #1f1f1f; border: 1px solid #3a3a3a; color: #cbd5e1; border-radius: 999px; padding: 4px 8px; cursor: pointer; font: 600 10px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .chip:hover { background: #2a2a2a; }
      .messages { flex: 1 1 auto; overflow: auto; padding: 10px 10px 0; display: flex; flex-direction: column; gap: 8px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 13px; line-height: 1.6; }
      .msg { border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.6; }
      /* HTML formatting styles for bot messages */
      .msg.bot h1 { font-size: 1.5em; font-weight: 600; margin: 0.5em 0; color: #e5e7eb; }
      .msg.bot h2 { font-size: 1.3em; font-weight: 600; margin: 0.5em 0; color: #e5e7eb; }
      .msg.bot h3 { font-size: 1.15em; font-weight: 600; margin: 0.4em 0; color: #e5e7eb; }
      .msg.bot h4 { font-size: 1.05em; font-weight: 600; margin: 0.3em 0; color: #e5e7eb; }
      .msg.bot p { margin: 0.5em 0; }
      .msg.bot ul, .msg.bot ol { margin: 0.5em 0; padding-left: 1.5em; }
      .msg.bot li { margin: 0.25em 0; }
      .msg.bot code { background: #1a1a1a; padding: 2px 4px; border-radius: 3px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 0.9em; color: #94a3b8; }
      .msg.bot pre { background: #1a1a1a; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
      .msg.bot pre code { background: transparent; padding: 0; font-size: 0.85em; }
      .msg.bot strong { font-weight: 600; color: #f1f5f9; }
      .msg.bot em { font-style: italic; color: #cbd5e1; }
      .msg.bot a { color: #60a5fa; text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
      .msg.bot a:hover { border-bottom-color: #60a5fa; }
      .msg.bot hr { border: none; border-top: 1px solid #3a3a3a; margin: 1em 0; }
      .msg.bot blockquote { border-left: 3px solid #3a3a3a; padding-left: 1em; margin: 0.5em 0; color: #9ca3af; }
      .user { background: #2f2f2f; align-self: flex-end; }
      .bot { background: #242424; align-self: flex-start; }
      .footer { padding: 10px; border-top: 1px solid #3a3a3a; display: flex; gap: 8px; align-items: center; }
      .inputWrap { position: relative; flex: 1 1 auto; min-width: 0; }
      .input { width: 100%; box-sizing: border-box; background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 8px; color: #e5e7eb; padding: 8px 30px 8px 10px; font: 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.35; outline: none; resize: none; overflow-y: auto; min-height: 32px; max-height: 140px; }
      .micBtn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #cbd5e1; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; z-index: 2; }
      .micBtn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .micBtn.stop { width: 24px; height: 24px; }
      .micBtn.stop svg { width: 18px; height: 18px; }
      .hidden { display: none !important; }
      /* Spinner animation for thinking state */
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .msg.thinking { opacity: 0.8; }
      .msg.thinking .spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #4a4a4a;
        border-top-color: #9ca3af;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-right: 6px;
        vertical-align: middle;
      }
      /* removed right-side transcribe indicator in favor of placeholder text */
      .send { background: #fefefe; color: #333333; border: 1px solid #d1d5db; font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
      .send:disabled { opacity: 0.6; cursor: not-allowed; }
      .hint { color: #9ca3af; font: 10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 0 10px 10px; }
      .thumb { max-width: 100%; border-radius: 6px; margin-top: 6px; border: 1px solid #1f2937; }
      /* Settings Overlay box transparency */
      .ov .box { opacity: 0.85; background: #2b2b2b; border: 1px solid #3a3a3a; }
    `;

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.title = 'n8n AI Assistant';
    fab.textContent = '✨';

    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('div');
    header.className = 'header';
    // language-aware header; will be filled after we resolve ui language
    header.innerHTML = `
      <div class="title">n8n AI</div>
      <div class="actions">
        <button type="button" class="btn icon" id="${NS}-settings" title="" aria-label="">⚙️</button>
        <button type="button" class="btn icon" id="${NS}-clear" title="" aria-label="">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M6 6l1 14h10l1-14" />
            <path d="M10 10v8M14 10v8" />
          </svg>
        </button>
        <button type="button" class="close" id="${NS}-close" title="" aria-label="Minimieren">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    `;

    const messages = document.createElement('div');
    messages.className = 'messages';

    const quick = document.createElement('div');
    quick.className = 'quick';
    quick.innerHTML = `
      <button class="chip" id="${NS}-qa-explain"></button>
      <button class="chip" id="${NS}-qa-errors"></button>
    `;

    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.innerHTML = `
      <input id="${NS}-file" type="file" accept="image/*" style="display:none" />
      <div class="inputWrap">
        <textarea id="${NS}-input" class="input" placeholder="" rows="1"></textarea>
        <button id="${NS}-mic" class="micBtn" title="" aria-label="">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
            <path d="M19 10a7 7 0 0 1-14 0" />
            <path d="M12 17v4" />
          </svg>
        </button>
        <button id="${NS}-mic-stop" class="micBtn stop hidden" title="" aria-label="">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2" ry="2" />
          </svg>
        </button>
      </div>
      <button id="${NS}-attach" class="btn icon" title="" aria-label="">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 17V7" />
          <path d="M8.5 10.5L12 7l3.5 3.5" />
          <path d="M5 17h14" />
        </svg>
      </button>
      <button id="${NS}-send" class="send" title="" aria-label=""></button>
    `;

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '';

    panel.appendChild(header);
    panel.appendChild(quick);
    panel.appendChild(messages);
    panel.appendChild(footer);
    panel.appendChild(hint);

    // Settings overlay (hidden by default)
    const overlay = document.createElement('div');
    overlay.id = `${NS}-overlay`;
    overlay.innerHTML = `
      <style>
        .ov { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 2147483647; }
        .ov.open { display: flex; }
        .box { width: 420px; max-width: 90vw; background: #0b1220; color: #e5e7eb; border: 1px solid #1f2937; border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,0.4); }
        .box h3 { margin: 0; font: 700 14px system-ui; padding: 12px; border-bottom: 1px solid #1f2937; }
        .box .content { padding: 12px; display: grid; gap: 10px; }
        .box label { font: 600 12px system-ui; }
        .box input { width: 100%; padding: 8px; border-radius: 8px; background: #0b1220; border: 1px solid #1f2937; color: #e5e7eb; font: 13px system-ui; box-sizing: border-box; }
        .box select { width: 100%; box-sizing: border-box; }
        .box .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .box .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px; border-top: 1px solid #1f2937; }
        .box button { background: #5b7fff; color: white; border: none; border-radius: 8px; padding: 8px 10px; cursor: pointer; font: 600 12px system-ui; }
        #${NS}-ov .box .actions #${NS}-cfg-save { background: #ED7863; }
        .box button.secondary { background: transparent; color: #cbd5e1; border: 1px solid #374151; }
      </style>
      <div class="ov" id="${NS}-ov">
        <div class="box">
          <h3 id="${NS}-overlay-title"></h3>
          <div class="content">
            <div>
              <label id="${NS}-lbl-lang"></label>
              <select id="${NS}-cfg-lang" style="width:100%; padding:8px; border-radius:8px; background:#0b1220; border:1px solid #1f2937; color:#e5e7eb; font:13px system-ui;">
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </div>
            <div class="row">
              <div>
                <label id="${NS}-lbl-model"></label>
                <select id="${NS}-cfg-model" style="width:100%; padding:8px; border-radius:8px; background:#0b1220; border:1px solid #1f2937; color:#e5e7eb; font:13px system-ui;">
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                </select>
              </div>
              <div>
                <label id="${NS}-lbl-temp"></label>
                <input id="${NS}-cfg-temperature" type="text" placeholder="0.2" />
              </div>
            </div>
            <div>
              <label id="${NS}-lbl-key"></label>
              <input id="${NS}-cfg-apiKey" type="password" placeholder="sk-..." />
            </div>
          </div>
          <div class="actions">
            <button class="secondary" id="${NS}-cfg-cancel"></button>
            <button id="${NS}-cfg-save"></button>
          </div>
          <div style="padding: 0 12px 12px; font: 12px system-ui; color: #9ca3af;">
            <a id="${NS}-pv-link" href="#" target="_blank" rel="noopener noreferrer" style="color:#cbd5e1; text-decoration: underline;"></a>
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(fab);
    shadow.appendChild(panel);
    shadow.appendChild(overlay);

    document.body.appendChild(root);

    function togglePanel(open) {
      state.isOpen = open !== undefined ? open : !state.isOpen;
      panel.classList.toggle('open', state.isOpen);
      if (state.isOpen) focusInputSoon();
    }

    fab.addEventListener('click', () => togglePanel());
    shadow.getElementById(`${NS}-close`).addEventListener('click', () => togglePanel(false));
    shadow.getElementById(`${NS}-settings`).addEventListener('click', () => {
      openSettings();
      try { shadow.getElementById(`${NS}-settings`).blur(); } catch {}
    });
    // Defensive: Event Delegation falls direkte Listener blockiert werden
    shadow.addEventListener('click', (ev) => {
      try {
        const path = ev.composedPath ? ev.composedPath() : [];
        const hit = path && path.find && path.find((el) => el && el.id === `${NS}-settings`);
        if (hit) {
          ev.preventDefault();
          openSettings();
          try { hit.blur && hit.blur(); } catch {}
        }
      } catch {}
    });
    shadow.getElementById(`${NS}-attach`).addEventListener('click', () => shadow.getElementById(`${NS}-file`).click());
    shadow.getElementById(`${NS}-file`).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const b64 = await fileToDataUrl(file);
      appendMessage('user', `(${t('status.imageAttached')})`);
      state.pendingImage = b64;
    });

    const input = shadow.getElementById(`${NS}-input`);
    const sendBtn = shadow.getElementById(`${NS}-send`);
    const micBtn = shadow.getElementById(`${NS}-mic`);
    const micStopBtn = shadow.getElementById(`${NS}-mic-stop`);
    let media = { stream: null, rec: null, chunks: [] };
    let phAnim = { id: null, base: '' };
    let thinkAnim = { id: null };

    function focusInputSoon() {
      try { input.focus(); } catch {}
      setTimeout(() => { try { input.focus(); } catch {} }, 0);
      autoSizeInput();
    }

    input.addEventListener('keydown', (e) => {
      // Stop bubbling out to the page (prevents site hotkeys on Space etc.)
      e.stopPropagation();
      const isEnter = (e.key === 'Enter' || e.key === 'NumpadEnter');
      if (isEnter && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const text = input.value.trim();
        send(text);
        focusInputSoon();
      }
    });
    input.addEventListener('keyup', (e) => { e.stopPropagation(); autoSizeInput(); });
    input.addEventListener('keypress', (e) => { e.stopPropagation(); });
    input.addEventListener('focus', () => { state.inputFocused = true; });
    input.addEventListener('blur', () => { state.inputFocused = false; });
    input.addEventListener('input', () => { autoSizeInput(); });

    function autoSizeInput() {
      try {
        input.style.height = 'auto';
        const max = 140;
        const h = Math.min(max, input.scrollHeight);
        input.style.height = h + 'px';
      } catch {}
    }

    // Handle pasted images
    panel.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            const b64 = await fileToDataUrl(file);
            appendMessage('user', `(${t('status.imageInserted')})`);
            state.pendingImage = b64;
            e.preventDefault();
          }
        }
      }
    });

    async function startRecording() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('errors.micUnavailable'));
        media.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        media.chunks = [];
        media.rec = new MediaRecorder(media.stream);
        media.rec.ondataavailable = (e) => { if (e.data && e.data.size) media.chunks.push(e.data); };
        media.rec.start();
        micBtn.classList.add('hidden');
        micStopBtn.classList.remove('hidden');
        input.setAttribute('data-prev-ph', input.placeholder || '');
        startPlaceholderAnim(t('status.recording'));
      } catch (e) {
        appendMessage('bot', t('errors.microphoneError', { details: String(e.message || e) }));
      }
    }

    async function stopRecording() {
      try {
        if (!media.rec) return;
        await new Promise((resolve) => {
          media.rec.onstop = resolve;
          media.rec.stop();
        });
        micStopBtn.classList.add('hidden');
        startPlaceholderAnim(t('status.transcribing'));
        const blob = new Blob(media.chunks, { type: media.rec.mimeType || 'audio/webm' });
        cleanupStream();
        const dataUrl = await blobToDataUrl(blob);
        const resp = await chrome.runtime.sendMessage({ type: 'AUDIO_TRANSCRIBE', payload: { dataUrl } });
        micBtn.classList.remove('hidden');
        stopPlaceholderAnim();
        input.placeholder = input.getAttribute('data-prev-ph') || 'Was kann ich für dich tun?';
        input.removeAttribute('data-prev-ph');
        if (resp?.error) {
          appendMessage('bot', `Transkriptionsfehler: ${resp.error}`);
          return;
        }
        if (resp?.text) {
          input.value = resp.text;
          focusInputSoon();
        }
      } catch (e) {
        micBtn.classList.remove('hidden');
        stopPlaceholderAnim();
        input.placeholder = input.getAttribute('data-prev-ph') || 'Was kann ich für dich tun?';
        input.removeAttribute('data-prev-ph');
        appendMessage('bot', `Transkriptionsfehler: ${String(e.message || e)}`);
      }
    }

    function cleanupStream() {
      try { media.rec = null; } catch {}
      try { media.chunks = []; } catch {}
      try { media.stream?.getTracks()?.forEach(t => t.stop()); media.stream = null; } catch {}
    }

    async function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }

    micBtn.addEventListener('click', startRecording);
    micStopBtn.addEventListener('click', stopRecording);

    function startPlaceholderAnim(base) {
      stopPlaceholderAnim();
      phAnim.base = String(base || '');
      let dots = 0;
      const tick = () => {
        input.placeholder = phAnim.base + (dots === 0 ? '' : '.'.repeat(dots));
        dots = (dots + 1) % 4; // 0..3 Punkte
      };
      tick();
      phAnim.id = setInterval(tick, 500);
    }

    function stopPlaceholderAnim() {
      if (phAnim.id) {
        clearInterval(phAnim.id);
        phAnim.id = null;
      }
    }

    function startThinkingAnim(el, base) {
      stopThinkingAnim();
      let dots = 0;
      const tick = () => {
        updateMessage(el, (base || t('status.thinking')) + (dots === 0 ? '' : '.'.repeat(dots)), { thinking: true });
        dots = (dots + 1) % 4; // 0..3 Punkte
      };
      tick();
      thinkAnim.id = setInterval(tick, 500);
    }

    function stopThinkingAnim() {
      if (thinkAnim.id) {
        clearInterval(thinkAnim.id);
        thinkAnim.id = null;
      }
    }

    async function send(textOverride) {
      if (!state.settings?.apiKey) {
        appendMessage('bot', t('errors.missingApiKey'));
        await openSettings();
        return;
      }
      const text = (textOverride ?? input.value.trim());
      if (!text && !state.pendingImage) return;
      sendBtn.disabled = true;
      input.value = '';

      appendMessage('user', text || `(${t('status.onlyImage')})`);
      const thinkingEl = await appendMessage('bot', t('status.thinking'), { thinking: true });
      startThinkingAnim(thinkingEl, t('status.thinking'));
      persistMessages();

      const payload = {
        text,
        image: state.pendingImage || null,
        pageUrl: location.href,
        context: collectN8nContext(),
        history: buildHistory(),
      };
      state.pendingImage = null;

      try {
        const res = await chrome.runtime.sendMessage({ type: 'AI_CHAT', payload });
        if (res?.error || res?.errorCode) {
          stopThinkingAnim();
          const msg = res?.errorCode
            ? (res.errorCode === 'missingApiKey' ? t('errors.missingApiKey')
              : res.errorCode === 'invalidAiJson' ? t('errors.invalidAiJson')
              : res.errorCode === 'transcribe' ? t('errors.transcribe', { details: res.details || '' })
              : t('errors.apiError', { details: res.details || res.error || '' }))
            : t('errors.apiError', { details: res.error });
          updateMessage(thinkingEl, msg, { thinking: false });
          persistMessages();
        } else if (res?.intent === 'create_workflow' && res?.workflow) {
          const result = await ensureCanvasAndInject(res.workflow);
          stopThinkingAnim();
          if (result === 'injected') {
            updateMessage(thinkingEl, t('status.created'), { thinking: false });
          } else if (result === 'scheduled') {
            updateMessage(thinkingEl, t('status.opening'), { thinking: true });
          } else {
            updateMessage(thinkingEl, t('errors.importFailed'), { thinking: false });
          }
          persistMessages();
        } else if (res?.answer) {
          stopThinkingAnim();
          updateMessage(thinkingEl, res.answer, { thinking: false });
          persistMessages();
        } else {
          stopThinkingAnim();
          updateMessage(thinkingEl, t('errors.apiError', { details: 'unknown' }), { thinking: false });
          persistMessages();
        }
      } catch (err) {
        stopThinkingAnim();
        appendMessage('bot', t('errors.processing', { details: String(err) }));
      } finally {
        sendBtn.disabled = false;
        persistMessages();
      }
    }

    sendBtn.addEventListener('click', async () => {
      const text = input.value.trim();
      await send(text);
      focusInputSoon();
    });

    // Quick Actions
    shadow.getElementById(`${NS}-qa-explain`).addEventListener('click', (e) => {
      send(t('prompts.explain'));
      if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      focusInputSoon();
    });
    shadow.getElementById(`${NS}-qa-errors`).addEventListener('click', (e) => {
      send(t('prompts.errors'));
      if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      focusInputSoon();
    });
    // (Quick Action entfernt)

    shadow.getElementById(`${NS}-clear`).addEventListener('click', async () => {
      state.messages = [];
      messages.innerHTML = '';
      await persistMessages(true);
      focusInputSoon();
    });

    // Markdown to HTML Konvertierung
    function markdownToHTML(text) {
      if (!text) return '';
      
      // Escape HTML entities first
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Code blocks (```code```)
      html = html.replace(/```([^`]*?)```/g, '<pre><code>$1</code></pre>');
      
      // Inline code (`code`)
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      
      // Bold (**text** or __text__)
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      
      // Italic (*text* or _text_)
      html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
      
      // Headlines (# H1, ## H2, ### H3, #### H4)
      html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      
      // Process lists
      let lines = html.split('\n');
      let processedLines = [];
      let inUList = false;
      let inOList = false;
      
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Check for unordered list
        if (line.match(/^[\*\-] /)) {
          if (!inUList) {
            processedLines.push('<ul>');
            inUList = true;
          }
          processedLines.push('<li>' + line.substring(2) + '</li>');
        }
        // Check for ordered list
        else if (line.match(/^[0-9]+\. /)) {
          if (!inOList) {
            processedLines.push('<ol>');
            inOList = true;
          }
          processedLines.push('<li>' + line.replace(/^[0-9]+\. /, '') + '</li>');
        }
        else {
          // Close open lists if we're out of them
          if (inUList) {
            processedLines.push('</ul>');
            inUList = false;
          }
          if (inOList) {
            processedLines.push('</ol>');
            inOList = false;
          }
          processedLines.push(line);
        }
      }
      
      // Close any remaining open lists
      if (inUList) processedLines.push('</ul>');
      if (inOList) processedLines.push('</ol>');
      
      html = processedLines.join('\n');
      
      // Links [text](url)
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      
      // Horizontal rule (--- or ***)
      html = html.replace(/^[\*\-]{3,}$/gm, '<hr>');
      
      // Line breaks and paragraphs
      html = html.replace(/  \n/g, '<br>');
      
      // Add paragraphs for text blocks
      let blocks = html.split(/\n\n+/);
      html = blocks.map(block => {
        // Don't wrap if already contains block elements
        if (block.match(/^<(?:h[1-6]|ul|ol|pre|hr|blockquote)/)) {
          return block;
        }
        // Don't wrap empty blocks
        if (!block.trim()) return '';
        // Wrap in paragraph
        return '<p>' + block + '</p>';
      }).filter(b => b).join('\n');
      
      return html;
    }

    async function appendMessage(role, text, opts = {}) {
      const el = document.createElement('div');
      el.className = `msg ${role === 'user' ? 'user' : 'bot'}` + (opts.thinking ? ' thinking' : '');
      if (opts.thinking) {
        const sp = document.createElement('span');
        sp.className = 'spinner';
        const tx = document.createElement('span');
        // Use innerHTML for bot messages with thinking state too
        if (role === 'bot') {
          tx.innerHTML = markdownToHTML(text);
        } else {
          tx.textContent = text || '';
        }
        el.appendChild(sp);
        el.appendChild(tx);
      } else {
        // Render as HTML for bot messages, plain text for user messages
        if (role === 'bot') {
          el.innerHTML = markdownToHTML(text);
        } else {
          el.textContent = text || '';
        }
      }
      if (opts.imageDataUrl) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.src = opts.imageDataUrl;
        el.appendChild(document.createElement('br'));
        el.appendChild(img);
      }
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      state.messages.push({ role, text, image: !!opts.imageDataUrl, thinking: !!opts.thinking });
      return el;
    }

    function updateMessage(el, text, opts = {}) {
      if (!el) return;
      el.classList.toggle('thinking', !!opts.thinking);
      while (el.firstChild) el.removeChild(el.firstChild);
      
      // Determine if this is a bot message by checking the element's class
      const isBot = el.classList.contains('bot');
      
      if (opts.thinking) {
        const sp = document.createElement('span');
        sp.className = 'spinner';
        const tx = document.createElement('span');
        // Use innerHTML for bot messages
        if (isBot) {
          tx.innerHTML = markdownToHTML(text);
        } else {
          tx.textContent = text || '';
        }
        el.appendChild(sp);
        el.appendChild(tx);
      } else {
        // Render as HTML for bot messages, plain text for user messages
        if (isBot) {
          el.innerHTML = markdownToHTML(text);
        } else {
          el.textContent = text || '';
        }
      }
      try {
        const idx = Array.prototype.indexOf.call(messages.children, el);
        if (idx >= 0 && idx < state.messages.length) {
          state.messages[idx].text = text || '';
          state.messages[idx].thinking = !!opts.thinking;
        }
      } catch {}
      messages.scrollTop = messages.scrollHeight;
    }

    async function persistMessages(clear = false) {
      const key = getChatKey();
      state.currentChatKey = key;
      const data = clear ? [] : state.messages;
      await storage.setLocal({ [key]: data });
    }

    function getChatKey() {
      try {
        const host = new URL(location.href).host;
        return `${NS}:chat:${host}`;
      } catch {
        return `${NS}:chat:global`;
      }
    }

    async function restoreMessages() {
      const saved = await storage.getLocal([getChatKey()]);
      const history = saved[getChatKey()] || [];
      messages.innerHTML = '';
      state.messages = [];
      for (const m of history) {
        await appendMessage(m.role, m.text);
      }
    }

    async function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // Helpers to open a new canvas and inject pending workflow
    function getPendingKey() {
      try {
        const host = new URL(location.href).host;
        return `${NS}:pending:${host}`;
      } catch {
        return `${NS}:pending:global`;
      }
    }

    function buildRouteCandidates() {
      try {
        const url = new URL(location.href);
        const basePrefix = (url.pathname.match(/^(.*?)(?:\/(workflow|workflows|editor)\b.*)?$/) || [,''])[1] || '';
        const origin = url.origin;
        return [
          `${origin}${basePrefix}/workflow/new`,
          `${origin}${basePrefix}/workflows/new`,
          `${origin}${basePrefix}/#/workflow/new`,
          `${origin}${basePrefix}/#/workflows/new`,
          `${origin}${basePrefix}/editor/workflow/new`,
          `${origin}${basePrefix}/editor/#/workflow/new`,
        ];
      } catch {
        return ['/workflow/new', '/workflows/new', '/#/workflow/new', '/#/workflows/new'];
      }
    }

    function navigateToPendingRoute(pending) {
      try {
        const routes = Array.isArray(pending.routes) ? pending.routes : buildRouteCandidates();
        const idx = Math.min(Math.max(Number(pending.idx) || 0, 0), routes.length - 1);
        const dest = routes[idx];
        pending.idx = (idx + 1) % routes.length;
        storage.setLocal({ [getPendingKey()]: pending });
        location.href = dest;
      } catch {
        try { location.href = '/#/workflow/new'; } catch {}
      }
    }

    async function waitForCanvas(ms = 12000, step = 200) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (findCanvasTarget()) return true;
        await sleep(step);
      }
      return false;
    }

    async function ensureCanvasAndInject(workflowObj) {
      if (findCanvasTarget()) {
        const ok = await injectWorkflowToCanvas(workflowObj);
        return ok ? 'injected' : false;
      }
      const pending = { workflow: workflowObj, ts: Date.now(), idx: 0, routes: buildRouteCandidates() };
      await storage.setLocal({ [getPendingKey()]: pending });
      navigateToPendingRoute(pending);
      return 'scheduled';
    }

    async function consumePendingWorkflow() {
      try {
        const key = getPendingKey();
        const saved = await storage.getLocal([key]);
        const pending = saved[key];
        if (!pending || !pending.workflow) return;
        const onEditor = /workflow/.test(location.pathname + location.hash);
        if (onEditor) {
          const ready = await waitForCanvas(8000, 150);
          if (!ready) { navigateToPendingRoute(pending); return; }
          await appendMessage('bot', t('workflow.injectingPrev'));
          const ok = await injectWorkflowToCanvas(pending.workflow);
          if (ok) {
            await appendMessage('bot', t('workflow.injected'));
            await storage.removeLocal([key]);
          }
          return;
        }
        navigateToPendingRoute(pending);
      } catch {}
    }

    function initRouteHooks() {
      if (state.routeHooked) return;
      state.routeHooked = true;
      const dispatch = () => {
        setTimeout(consumePendingWorkflow, 50);
        setTimeout(consumePendingWorkflow, 400);
        setTimeout(consumePendingWorkflow, 1000);
      };
      try {
        const origPush = history.pushState; history.pushState = function(){ const r = origPush.apply(this, arguments); dispatch(); return r; };
      } catch {}
      try {
        const origRepl = history.replaceState; history.replaceState = function(){ const r = origRepl.apply(this, arguments); dispatch(); return r; };
      } catch {}
      window.addEventListener('popstate', dispatch);
      window.addEventListener('hashchange', dispatch);
    }

    // Load basic settings incl language
    storage.get(['allowedSites','model','temperature','apiKey','uiLang']).then(async (cfg) => {
      state.settings = cfg || {};
      await loadTranslations(state.settings.uiLang || 'de');
      applyTranslations(state.settings.uiLang || 'de');
      updateHintForApiKey();
    });

    // Restore any existing chat
    restoreMessages();

    // Start observers for error auto-detection
    bootErrorObserver();

    // Pending workflow handling on load/route changes
    consumePendingWorkflow();
    initRouteHooks();

    // Tasten überall im Panel: wenn das Eingabefeld nicht fokussiert ist,
    // leite Zeichen (inkl. Space) ins Eingabefeld um.
    panel.addEventListener('keydown', (e) => {
      if (state.inputFocused) return;
      const tag = (e.target && e.target.tagName) || '';
      const isInputField = tag === 'INPUT' || tag === 'TEXTAREA';
      if (isInputField) return;
      if (e.key === ' ' || (e.key && e.key.length === 1)) {
        e.preventDefault();
        focusInputSoon();
        if (e.key === ' ') input.value += ' ';
        else input.value += e.key;
      }
    }, true);

    // Blockiere grundsätzlich alle Key-Events aus dem Shadow-DOM, damit
    // n8n-Hotkeys (Space etc.) nicht reagieren, solange der Chat genutzt wird.
    // Stop at bubble phase so target handlers (like input Enter) still run
    shadow.addEventListener('keydown', (e) => { e.stopPropagation(); });
    shadow.addEventListener('keyup', (e) => { e.stopPropagation(); });
    shadow.addEventListener('keypress', (e) => { e.stopPropagation(); });

    // Hinweis: ursprüngliche mousedown-Blockade entfernt, damit Buttons (z.B. Einstellungen) wieder zuverlässig klicken
  }

  let I18N_DICT = {};
  function t(key, params) {
    const parts = key.split('.');
    let cur = I18N_DICT;
    for (const p of parts) { if (cur && typeof cur === 'object') cur = cur[p]; else return key; }
    let s = typeof cur === 'string' ? cur : key;
    if (params) { for (const k in params) s = s.replace(new RegExp(`\\{${k}\\}`,'g'), String(params[k])); }
    return s;
  }

  async function loadTranslations(lang) {
    // Prüfe Extension-Kontext BEVOR chrome.runtime.getURL()
    if (!isExtContextValid()) {
      console.warn('Extension context invalid, using fallback translations');
      I18N_DICT = {
        ui: { settings: 'Settings', close: 'Close', clear: 'Clear chat' },
        overlay: { title: 'AI Assistant Settings' },
        error: { noApiKey: 'Please configure your API key in settings.' }
      };
      return;
    }

    const fallbackLang = 'en';
    const defaultTranslations = {
      ui: { settings: 'Settings', close: 'Close', clear: 'Clear chat' },
      overlay: { title: 'AI Assistant Settings' },
      error: { noApiKey: 'Please configure your API key in settings.' }
    };

    try {
      const url = chrome.runtime.getURL(`assets/i18n/${lang}.json`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      I18N_DICT = await res.json();
    } catch (primaryError) {
      try {
        const fallbackUrl = chrome.runtime.getURL(`assets/i18n/${fallbackLang}.json`);
        const res = await fetch(fallbackUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        I18N_DICT = await res.json();
      } catch (fallbackError) {
        console.warn('Translation loading failed, using defaults:', { primaryError, fallbackError });
        I18N_DICT = defaultTranslations;
      }
    }
  }

  function applyTranslations(lang) {
    try {
      const sh = document.getElementById(`${NS}-root`).shadowRoot;
      sh.getElementById(`${NS}-settings`).title = t('ui.settings');
      sh.getElementById(`${NS}-settings`).setAttribute('aria-label', t('ui.settings'));
      sh.getElementById(`${NS}-clear`).title = t('ui.clear');
      sh.getElementById(`${NS}-clear`).setAttribute('aria-label', t('ui.clear'));
      sh.getElementById(`${NS}-close`).title = t('ui.close');
      sh.getElementById(`${NS}-qa-explain`).textContent = t('ui.chip.explain');
      sh.getElementById(`${NS}-qa-errors`).textContent = t('ui.chip.errors');
      sh.getElementById(`${NS}-input`).placeholder = t('ui.placeholder');
      sh.getElementById(`${NS}-mic`).title = t('ui.mic');
      sh.getElementById(`${NS}-mic`).setAttribute('aria-label', t('ui.mic'));
      sh.getElementById(`${NS}-mic-stop`).title = t('ui.stop');
      sh.getElementById(`${NS}-mic-stop`).setAttribute('aria-label', t('ui.stop'));
      sh.getElementById(`${NS}-attach`).title = t('ui.upload');
      sh.getElementById(`${NS}-attach`).setAttribute('aria-label', t('ui.upload'));
      sh.getElementById(`${NS}-send`).textContent = t('ui.send');
      sh.querySelector('.hint').textContent = t('ui.hint');
      state.uiText = {
        thinking: t('status.thinking'),
        recording: t('status.recording'),
        transcribing: t('status.transcribing')
      };
    } catch {}
  }

  function buildHistory() {
    // Nimm die letzten 8 Textnachrichten (user/bot), ignoriere Bilder-Hinweise
    const items = (state.messages || []).slice(-8);
    return items.map((m) => ({ role: m.role, text: m.text || '' }));
  }

  function updateHintForApiKey() {
    try {
      const sh = document.getElementById(`${NS}-root`).shadowRoot;
      const hintEl = sh.querySelector('.hint');
      const hasKey = !!(state.settings && state.settings.apiKey);
      hintEl.textContent = hasKey ? t('ui.hint') : t('errors.missingApiKey');
    } catch {}
  }

  async function openSettings() {
    const sh = document.getElementById(`${NS}-root`).shadowRoot;
    const ov = sh.getElementById(`${NS}-ov`);
    const modelEl = sh.getElementById(`${NS}-cfg-model`);
    const tempEl = sh.getElementById(`${NS}-cfg-temperature`);
    const keyEl = sh.getElementById(`${NS}-cfg-apiKey`);
    const langSel = sh.getElementById(`${NS}-cfg-lang`);

    const cfg = await storage.get(['model','temperature','apiKey','uiLang']);
    modelEl.value = (cfg.model && ['gpt-4o','gpt-4o-mini','gpt-4.1'].includes(cfg.model)) ? cfg.model : 'gpt-4o';
    tempEl.value = cfg.temperature != null ? String(cfg.temperature) : '0.2';
    keyEl.value = cfg.apiKey || '';
    const selLang = (cfg.uiLang === 'en' ? 'en' : 'de');
    // reorder options so selected language appears first
    const langs = ['de','en'];
    const ordered = [selLang, ...langs.filter(l => l !== selLang)];
    langSel.innerHTML = ordered.map(l => `<option value="${l}">${l === 'de' ? 'Deutsch' : 'English'}</option>`).join('');
    langSel.value = selLang;

    // localize overlay labels/buttons
    await loadTranslations(selLang);
    const applyOverlayLabels = () => {
      sh.getElementById(`${NS}-overlay-title`).textContent = t('overlay.title');
      sh.getElementById(`${NS}-lbl-lang`).textContent = t('overlay.labels.lang');
      sh.getElementById(`${NS}-lbl-model`).textContent = t('overlay.labels.model');
      sh.getElementById(`${NS}-lbl-temp`).textContent = t('overlay.labels.temperature');
      sh.getElementById(`${NS}-lbl-key`).textContent = t('overlay.labels.apiKey');
      sh.getElementById(`${NS}-cfg-cancel`).textContent = t('overlay.actions.cancel');
      sh.getElementById(`${NS}-cfg-save`).textContent = t('overlay.actions.save');
      const PRIV_URL = chrome.runtime.getURL('PRIVACY.md');
      const pv = sh.getElementById(`${NS}-pv-link`);
      pv.textContent = t('privacy.label');
      pv.href = PRIV_URL;
    };
    applyOverlayLabels();

    ov.classList.add('open');

    sh.getElementById(`${NS}-cfg-cancel`).onclick = () => { ov.classList.remove('open'); focusAssistantInputSoon(); };
    langSel.onchange = async () => {
      const newLang = (langSel.value === 'en' ? 'en' : 'de');
      // Reorder options so current language appears first
      const langs2 = ['de','en'];
      const ordered2 = [newLang, ...langs2.filter(l => l !== newLang)];
      langSel.innerHTML = ordered2.map(l => `<option value="${l}">${l === 'de' ? 'Deutsch' : 'English'}</option>`).join('');
      langSel.value = newLang;
      await loadTranslations(newLang);
      applyOverlayLabels();
      applyTranslations(newLang);
      updateHintForApiKey();
    };
    sh.getElementById(`${NS}-cfg-save`).onclick = async () => {
      const payload = {
        provider: 'openai',
        model: modelEl.value.trim() || 'gpt-4o',
        temperature: parseFloat(tempEl.value) || 0.2,
        apiKey: keyEl.value.trim(),
        createMethod: 'ui',
        uiLang: (sh.getElementById(`${NS}-cfg-lang`)?.value === 'en' ? 'en' : 'de'),
      };
      await storage.set(payload);
      state.settings = { ...(state.settings || {}), ...payload };
      ov.classList.remove('open');
      updateHintForApiKey();
      focusAssistantInputSoon();
      await loadTranslations(state.settings.uiLang || 'de');
      applyTranslations(state.settings.uiLang || 'de');
    };
  }

  function collectN8nContext() {
    return {
      url: location.href,
      errors: state.lastErrors?.slice(-5) || [],
      nodes: collectNodeTitles().slice(0, 50),
    };
  }

  function collectNodeTitles() {
    const titles = new Set();
    try {
      const cands = document.querySelectorAll('[data-test-id="canvas"] [data-test-id*="node"], [class*="canvas"] [class*="node"], svg text');
      cands.forEach((el) => {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt && txt.length < 120) titles.add(txt);
      });
    } catch {}
    return Array.from(titles);
  }

  function bootErrorObserver() {
    try {
      const gather = () => {
        const errors = new Set(state.lastErrors || []);
        const sels = [
          '[class*="error"]',
          '[data-test-id*="error"]',
          '.el-notification__content',
          '.n8n-notification',
        ];
        document.querySelectorAll(sels.join(',')).forEach((el) => {
          const txt = (el.innerText || el.textContent || '').trim();
          if (!txt) return;
          // Heuristik: enthält "error"/"fehler" oder typische Marker
          if (/error|fehler|failed|exception/i.test(txt)) errors.add(txt);
        });
        state.lastErrors = Array.from(errors).slice(-10);
      };
      const mo = new MutationObserver(() => gather());
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: false });
      gather();
    } catch {}
  }

  async function injectWorkflowToCanvas(workflowObj) {
    try {
      const json = JSON.stringify(workflowObj);
      // Try paste-based import first
      if (await tryPasteImport(json)) return true;
      // Fallback: try simulated drop
      if (await tryDropImport(json)) return true;
    } catch (e) {
      console.warn('injectWorkflowToCanvas error', e);
    }
    return false;
  }

  async function tryPasteImport(text) {
    try {
      const dt = new DataTransfer();
      // Provide multiple common MIME types so n8n can pick up any
      dt.setData('text/plain', text);
      try { dt.setData('text', text); } catch {}
      try { dt.setData('application/json', text); } catch {}

      // Primary: real ClipboardEvent at canvas
      let ok = false;
      const target = findCanvasTarget() || document.body;
      try {
        const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        ok = target.dispatchEvent(evt);
      } catch {}

      // Fallbacks: dispatch at document and window (some apps listen there)
      if (!ok) {
        try {
          const evDoc = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          ok = document.dispatchEvent(evDoc) || ok;
        } catch {}
        try {
          const evWin = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          ok = window.dispatchEvent(evWin) || ok;
        } catch {}
      }

      // Give n8n time to process
      await sleep(300);
      return true;
    } catch (e) {
      console.warn('tryPasteImport failed', e);
      return false;
    }
  }

  async function tryDropImport(text) {
    try {
      const target = findCanvasTarget();
      if (!target) return false;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      try { dt.setData('text', text); } catch {}
      try { dt.setData('application/json', text); } catch {}

      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      const createEvt = (type) => {
        const ev = new DragEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, dataTransfer: dt });
        // Ensure dataTransfer is present (some browsers ignore init)
        if (!ev.dataTransfer) {
          try { Object.defineProperty(ev, 'dataTransfer', { value: dt }); } catch {}
        }
        return ev;
      };
      target.dispatchEvent(createEvt('dragenter'));
      target.dispatchEvent(createEvt('dragover'));
      target.dispatchEvent(createEvt('drop'));
      await sleep(300);
      return true;
    } catch (e) {
      console.warn('tryDropImport failed', e);
      return false;
    }
  }

  function findCanvasTarget() {
    const selectors = [
      '[data-test-id="canvas"]',
      '[data-test-id*="canvas"]',
      '.workflow-canvas',
      '.canvas',
      'svg'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function maybeInject() {
    const cfg = await storage.get(['allowedSites']);
    const allowed = cfg?.allowedSites || [];
    if (matchesAllowedSite(location.href, allowed)) {
      ensureInjected();
      return;
    }
    // manual toggle per host
    const key = getForceKey();
    const local = await storage.getLocal([key]);
    if (local[key]) ensureInjected();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    maybeInject();
  } else {
    window.addEventListener('DOMContentLoaded', maybeInject);
  }

  // React to popup toggles
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const key = getForceKey();
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      const val = changes[key]?.newValue;
      if (val) {
        ensureInjected();
      } else {
        // remove UI if present
        const root = document.getElementById(`${NS}-root`);
        if (root && root.parentNode) root.parentNode.removeChild(root);
      }
    }
  });
})();
