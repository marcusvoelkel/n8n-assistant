// service worker: routes chat to LLM, UI injection 

const DEFAULTS = { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2 };

const MODEL_MAP = {
  'gpt-4.1': { apiBase: 'https://api.openai.com/v1', apiType: 'chat' },
  'gpt-4o': { apiBase: 'https://api.openai.com/v1', apiType: 'chat' },
  'gpt-4o-mini': { apiBase: 'https://api.openai.com/v1', apiType: 'chat' },
  'gpt-4.1-mini': { apiBase: 'https://api.openai.com/v1', apiType: 'chat' },
  'gpt-4.1-nano': { apiBase: 'https://api.openai.com/v1', apiType: 'chat' },
};

// --- Dynamic registration for content scripts on user-defined hosts ---
const CS_ID = 'assistant_dynamic';

async function getActivatedOrigins() {
  const { activatedOrigins } = await chrome.storage.sync.get(['activatedOrigins']);
  return Array.isArray(activatedOrigins) ? activatedOrigins : [];
}

async function setActivatedOrigins(list) {
  await chrome.storage.sync.set({ activatedOrigins: list });
}

async function refreshRegisteredScripts() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CS_ID] }).catch(() => []);
    if (existing && existing.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [CS_ID] }).catch(() => {});
    }
  } catch {}
  const origins = await getActivatedOrigins();
  if (!origins.length) return;
  const matches = origins.map((o) => `${o.replace(/\/$/, '')}/*`);
  await chrome.scripting.registerContentScripts([{
    id: CS_ID,
    js: ['contentScript.js'],
    matches,
    runAt: 'document_end',
    world: 'ISOLATED'
  }]);
}

async function requestOriginPermission(origin) {
  const ok = await chrome.permissions.request({ origins: [`${origin.replace(/\/$/, '')}/*`] });
  return !!ok;
}

async function removeOriginPermission(origin) {
  try { await chrome.permissions.remove({ origins: [`${origin.replace(/\/$/, '')}/*`] }); } catch {}
}

chrome.runtime.onInstalled.addListener(() => { refreshRegisteredScripts(); });
chrome.runtime.onStartup?.addListener?.(() => { refreshRegisteredScripts(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'REGISTER_ORIGIN') {
    (async () => {
      const origin = String(msg.origin || '').trim();
      if (!/^https?:\/\//i.test(origin)) throw new Error('invalid origin');
      const ok = await requestOriginPermission(origin);
      if (!ok) { sendResponse({ ok: false, error: 'permission_denied' }); return; }
      const cur = await getActivatedOrigins();
      if (!cur.includes(origin)) cur.push(origin);
      await setActivatedOrigins(cur);
      await refreshRegisteredScripts();
      sendResponse({ ok: true });
    })().catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === 'UNREGISTER_ORIGIN') {
    (async () => {
      const origin = String(msg.origin || '').trim();
      const cur = await getActivatedOrigins();
      const next = cur.filter((o) => o !== origin);
      await setActivatedOrigins(next);
      await removeOriginPermission(origin);
      await refreshRegisteredScripts();
      sendResponse({ ok: true });
    })().catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});

// i18n utilities (mirror contentScript approach)
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
  const url = chrome.runtime.getURL(`assets/i18n/${lang}.json`);
  try {
    const res = await fetch(url);
    I18N_DICT = await res.json();
  } catch {
    const res = await fetch(chrome.runtime.getURL('assets/i18n/de.json'));
    I18N_DICT = await res.json();
  }
}
async function getLang() {
  try {
    const { uiLang } = await chrome.storage.sync.get(['uiLang']);
    return (uiLang === 'en' ? 'en' : 'de');
  } catch { return 'de'; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'AI_CHAT') {
    handleChat(msg.payload).then(sendResponse).catch((err) => {
      console.error('AI_CHAT error', err);
      sendResponse({ errorCode: 'apiError', details: String(err?.message || err) });
    });
    // keep channel open for async
    return true;
  }
  if (msg?.type === 'AUDIO_TRANSCRIBE') {
    handleTranscribe(msg.payload).then(sendResponse).catch((err) => {
      console.error('AUDIO_TRANSCRIBE error', err);
      sendResponse({ errorCode: 'transcribe', details: String(err?.message || err) });
    });
    return true;
  }
});

async function getSettings() {
  const cfg = await chrome.storage.sync.get([
    'provider', 'apiKey', 'model', 'temperature', 'createMethod'
  ]);
  return { ...DEFAULTS, ...cfg };
}

function systemPrompt() {
  return (
    'Du bist ein n8n-Assistent. Erkenne die Absicht (Intent) der Nutzereingabe und antworte ausschließlich als JSON ohne weitere Erklärungen. ' +
    'Antwortsprache: exakt die Sprache der Nutzereingabe. ' +
    'Schema: {"intent":"create_workflow|qa|help|unknown","answer":"string optional","workflow":{...},"notes":"optional"}. ' +
    'Beim Intent "create_workflow": ' +
      '- Erzeuge gültiges n8n Workflow-JSON (triggers, name, nodes[], connections{}, settings, pinData). ' +
      '- Verweise auf vorhandene Credential-Namen nur textuell (davon ausgehen, dass sie existieren). ' +
      '- Berücksichtige Zeitzonen (z.B. Europe/Berlin), Wiederholungen und sinnvolle Defaults. ' +
      '- Workflow muss direkt auf dem Canvas nutzbar sein. ' +
    'Kontext (Fehler, Node-Liste, URL) kann bereitgestellt werden – berücksichtige ihn bei QA/Help.'
  );
}

async function handleChat(payload) {
  // load translations for any fallback strings
  await loadTranslations(await getLang());
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { errorCode: 'missingApiKey' };
  }
  const { text, image, pageUrl, context, history } = payload || {};

  const messages = [];
  messages.push({ role: 'system', content: systemPrompt() });

  // Chat history
  if (Array.isArray(history)) {
    for (const h of history) {
      const role = h.role === 'bot' ? 'assistant' : (h.role === 'user' ? 'user' : 'assistant');
      const txt = typeof h.text === 'string' ? h.text : '';
      if (!txt) continue;
      messages.push({ role, content: [{ type: 'text', text: txt }] });
    }
  }

  const parts = [];
  if (text) parts.push({ type: 'text', text });
  if (image && typeof image === 'string') {
    parts.push({ type: 'image_url', image_url: { url: image } });
  }
  if (context) {
    const trimmed = JSON.stringify(context).slice(0, 8000);
    parts.push({ type: 'text', text: `Kontext:\n${trimmed}` });
  }
  messages.push({ role: 'user', content: parts });

  let chosenModel = settings.model;
  if (!MODEL_MAP[chosenModel]) chosenModel = 'gpt-4o';
  const mc = MODEL_MAP[chosenModel];
  const aiText = await callOpenAI({
    apiType: mc.apiType,
    apiBase: mc.apiBase,
    apiKey: settings.apiKey,
    model: chosenModel,
    temperature: settings.temperature,
    messages,
  });

  let parsed;
  try {
    parsed = JSON.parse(safeExtractJson(aiText));
  } catch (e) {
    console.warn('Failed to parse AI JSON. Raw:', aiText);
    return { errorCode: 'invalidAiJson' };
  }

  if (parsed.intent === 'create_workflow' && parsed.workflow) {
    return { intent: 'create_workflow', workflow: parsed.workflow };
  }

  if (parsed.intent === 'qa' || parsed.intent === 'help') {
    return { intent: parsed.intent, answer: parsed.answer || t('ai.assessment') };
  }

  return { intent: 'unknown', answer: parsed.answer || t('ai.unknown') };
}

function safeExtractJson(text) {
  // In case the model wraps JSON in code fences or adds stray text
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, end + 1);
    }
  } catch {}
  return text;
}

async function callOpenAI({ apiType, apiBase, apiKey, model, temperature, messages }) {
  const base = apiBase.replace(/\/$/, '');
  if (apiType === 'responses') {
    // Extract optional system instructions; Responses API prefers 'instructions' over a system role message
    let instructions = '';
    try {
      const sysMsg = messages.find((m) => m.role === 'system');
      if (sysMsg) {
        const parts = Array.isArray(sysMsg.content) ? sysMsg.content : [{ type: 'text', text: String(sysMsg.content || '') }];
        instructions = parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
      }
    } catch {}
    const rest = messages.filter((m) => m.role !== 'system');
    const body = instructions
      ? { model, instructions, input: toResponsesInput(rest) }
      : { model, input: toResponsesInput(rest) };
    const res = await fetch(base + '/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(t('errors.openaiResponses', { status: res.status, details: txt || '' }));
    }
    const data = await res.json();
    const content = data?.output_text || data?.response?.output_text || '';
    if (!content) throw new Error(t('errors.emptyAi'));
    return content;
  }
  // default: chat completions
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature, messages }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(t('errors.openaiChat', { status: res.status, details: txt || '' }));
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(t('errors.emptyAi'));
  return content;
}

function toResponsesInput(messages) {
  // Transform chat-style messages (with content parts of type 'text'|'image_url')
  // into Responses API input with 'input_text'/'input_image'
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => {
    // Responses API expects assistant history to use output_* types
    // and user/system inputs to use input_* types.
    const role = m.role || 'user';
    const partsArr = Array.isArray(m.content)
      ? m.content
      : (m.content != null ? [{ type: 'text', text: String(m.content) }] : []);

    const content = partsArr.map((p) => {
      const isAssistant = role === 'assistant';
      if (p.type === 'text') {
        return isAssistant
          ? { type: 'output_text', text: p.text || '' }
          : { type: 'input_text', text: p.text || '' };
      }
      if (p.type === 'image_url') {
        // images are inputs from user side; assistant images are not expected here
        return { type: 'input_image', image_url: p.image_url?.url || p.image_url };
      }
      // Fallback
      return isAssistant
        ? { type: 'output_text', text: p.text || '' }
        : { type: 'input_text', text: p.text || '' };
    });
    // If assistant with empty content, ensure at least an output_text empty to satisfy schema
    if (role === 'assistant' && content.length === 0) {
      content.push({ type: 'output_text', text: '' });
    }
    if ((role === 'user' || role === 'system') && content.length === 0) {
      content.push({ type: 'input_text', text: '' });
    }
    return { role, content };
  });
}

async function handleTranscribe(payload) {
  await loadTranslations(await getLang());
  const settings = await getSettings();
  if (!settings.apiKey) return { error: t('errors.missingApiKey') };
  const dataUrl = payload?.dataUrl;
  if (!dataUrl) return { error: t('errors.noAudio') };
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' });
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  // Sprache: Auto-Detection 
  const url = (MODEL_MAP['gpt-4']?.apiBase || 'https://api.openai.com/v1').replace(/\/$/, '') + '/audio/transcriptions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${settings.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(t('errors.transcribeApi', { status: res.status, details: txt || '' }));
  }
  const data = await res.json();
  const text = data?.text || '';
  return { text };
}
