(() => {
  const NS = 'n8n-ai-assistant';
  const hostEl = document.getElementById('host');
  const toggleBtn = document.getElementById('toggle');
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

  function getHostFromUrl(url) {
    try { return new URL(url).host; } catch { return null; }
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

  function render(host, enabled) {
    const enableText = t('popup.enable') || t('ui.enable') || 'Aktivieren';
    const disableText = t('popup.disable') || t('ui.disable') || 'Deaktivieren';
    hostEl.textContent = host || '—';
    toggleBtn.textContent = enabled ? disableText : enableText;
    toggleBtn.classList.toggle('btn-primary', !enabled);
    toggleBtn.classList.toggle('btn-secondary', enabled);
    statusEl.innerHTML = enabled ? (t('popup.statusOn') || '') : (t('popup.statusOff') || '');
  }

  async function init() {
    const tab = await getActiveTab();
    const cfg = await chrome.storage.sync.get(['uiLang']);
    const lang = (cfg.uiLang === 'en' ? 'en' : 'de');
    await loadTranslations(lang);
    titleEl.textContent = t('popup.title');
    descEl.textContent = t('popup.desc');
    const PRIV_URL = chrome.runtime.getURL('PRIVACY.md');
    noteEl.innerHTML = `${t('popup.note')} <a href="${PRIV_URL}" target="_blank" rel="noopener noreferrer">${t('privacy.label')}</a>`;
    const host = getHostFromUrl(tab?.url || '');
    render(host, false);
    if (!host) return;
    const enabled = await readEnabled(host);
    render(host, enabled);
    toggleBtn.onclick = async () => {
      const now = await readEnabled(host);
      await writeEnabled(host, !now);
      render(host, !now);
      try {
        if (tab?.id && !now) {
          // ensure script is injected when enabling on domains without content_script
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['contentScript.js'] });
        }
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'N8N_AI_TOGGLE', host, enabled: !now });
      } catch {}
    };
  }

  init();
})();
