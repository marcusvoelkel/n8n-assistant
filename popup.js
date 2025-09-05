(() => {
  const NS = 'n8n-ai-assistant';
  const originInput = document.getElementById('origin');
  const activateBtn = document.getElementById('activate');
  const statusEl = document.getElementById('status');
  const titleEl = document.querySelector('.title');
  const descEl = document.querySelector('.desc');
  const noteEl = document.querySelector('.note');
  let I18N_DICT = {};
  function t(key) {
    const parts = key.split('.'); let cur = I18N_DICT;
    for (const p of parts) { if (cur && typeof cur === 'object') cur = cur[p]; else return key; }
    return typeof cur === 'string' ? cur : key;
  }
  async function loadTranslations(lang) {
    const url = chrome.runtime.getURL(`assets/i18n/${lang}.json`);
    try { const res = await fetch(url); I18N_DICT = await res.json(); }
    catch { const res = await fetch(chrome.runtime.getURL('assets/i18n/de.json')); I18N_DICT = await res.json(); }
  }

  function normalizeOrigin(input) {
    try {
      const u = new URL(input);
      if (!/^https?:$/i.test(u.protocol)) return null;
      return `${u.protocol}//${u.host}`;
    } catch {
      // allow host without protocol -> assume https
      try {
        const u = new URL('https://' + String(input).trim());
        return `${u.protocol}//${u.host}`;
      } catch { return null; }
    }
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function getForceKey(host) { return `${NS}:force:${host}`; }

  async function readEnabled(host) {
    const key = getForceKey(host);
    const data = await chrome.storage.local.get([key]);
    return !!data[key];
  }

  async function writeEnabled(host, val) {
    const key = getForceKey(host);
    if (val) await chrome.storage.local.set({ [key]: true });
    else await chrome.storage.local.remove([key]);
  }

  function renderStatus(enabled) {
    const on = t('popup.statusOn') || 'Enabled. The assistant appears bottom right.';
    const off = t('popup.statusOff') || 'Disabled. Click “Enable” to show it.';
    statusEl.innerHTML = enabled ? on : off;
  }

  async function init() {
    const tab = await getActiveTab();
    const cfg = await chrome.storage.sync.get(['uiLang']);
    // Default: English (if unset)
    const lang = (cfg.uiLang === 'de' ? 'de' : 'en');
    await loadTranslations(lang);
    titleEl.textContent = t('popup.title');
    descEl.textContent = t('popup.desc');
    const PRIV_URL = 'https://flowsai.io/privacy.html';
    noteEl.innerHTML = `${t('popup.note')} <a href="${PRIV_URL}" target="_blank" rel="noopener noreferrer">${t('privacy.label')}</a>`;
    // Do not prefill origin; user must enter URL explicitly

    async function enableForOrigin(origin) {
      // persist toggle for immediate UI
      const host = (() => { try { return new URL(origin).host; } catch { return null; } })();
      if (host) await writeEnabled(host, true);
      // ask background to request permission + register script
      const res = await chrome.runtime.sendMessage({ type: 'REGISTER_ORIGIN', origin });
      if (!res?.ok) throw new Error(res?.error || 'activation_failed');
      renderStatus(true);
      // try to inject immediately on current tab if it matches
      if (tab?.id && tab?.url && tab.url.startsWith(origin)) {
        try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['contentScript.js'] }); } catch {}
      }
    }

    activateBtn.onclick = async () => {
      const origin = normalizeOrigin(originInput.value);
      if (!origin) { statusEl.textContent = 'Enter a valid https:// URL'; return; }
      try { await enableForOrigin(origin); } catch (e) { statusEl.textContent = `Activation failed: ${e?.message || e}`; }
    };
  }

  init();
})();
