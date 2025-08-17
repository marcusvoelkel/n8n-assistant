const DEFAULTS = {
  provider: 'openai',
  apiBase: 'https://api.openai.com/v1',
  model: 'gpt-5',
  temperature: '0.2',
  createMethod: 'ui',
  allowedSites: [
    'https://n8n.ai4teams.de',
    'https://n8n.*',
    'n8n*',
    'localhost',
    '127.0.0.1',
  ],
};

function $(id) { return document.getElementById(id); }

async function load() {
  const cfg = await new Promise((resolve) => chrome.storage.sync.get(Object.keys(DEFAULTS), resolve));
  const data = { ...DEFAULTS, ...cfg };
  $('provider').value = data.provider;
  $('apiBase').value = data.apiBase;
  $('model').value = data.model;
  $('apiKey').value = cfg.apiKey || '';
  $('temperature').value = String(data.temperature);
  $('createMethod').value = data.createMethod;
  $('allowedSites').value = (data.allowedSites || []).join('\n');
}

async function save() {
  const allowedSites = $('allowedSites').value
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const payload = {
    provider: $('provider').value.trim() || DEFAULTS.provider,
    apiBase: $('apiBase').value.trim() || DEFAULTS.apiBase,
    model: $('model').value.trim() || DEFAULTS.model,
    apiKey: $('apiKey').value.trim(),
    temperature: parseFloat($('temperature').value) || parseFloat(DEFAULTS.temperature),
    createMethod: $('createMethod').value.trim() || 'ui',
    allowedSites,
  };
  await new Promise((resolve) => chrome.storage.sync.set(payload, resolve));
  alert('Gespeichert.');
}

async function reset() {
  await new Promise((resolve) => chrome.storage.sync.set(DEFAULTS, resolve));
  await new Promise((resolve) => chrome.storage.sync.remove(['apiKey'], resolve));
  await load();
  alert('Zur Defaults zurückgesetzt.');
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', reset);
});
