'use strict';
// Independent experimental preload for Gacha Forge -> Engine image requests.
// Does not modify Marinara/Gacha Forge source files.
const originalFetch = globalThis.fetch;
const delays = new Map();
const known = new Map();
let diagnosticCount = 0;
let shapePrinted = false;
let avatarLogged = 0;
function diagnostic(message) {
  if (diagnosticCount++ < 12) console.info('[gacha-novelai-delay] diagnostic: ' + message);
}
const LOW = 2000, HIGH = 5000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const str = value => typeof value === 'string' ? value.toLowerCase() : '';
function providerIsNovelAi(c) {
  if (!c || typeof c !== 'object') return false;
  // Match the Engine's explicit image-provider preference before checking fallback hints.
  const explicit = String(c.imageService || c.imageGenerationSource || '').trim();
  if (explicit) return /^novel[\s_-]?ai$/i.test(explicit);
  const values = [c.provider, c.imageProvider, c.service, c.providerType, c.apiType,
    c.config?.provider, c.settings?.provider, c.source];
  if (values.some(v => /^novel[\s_-]?ai$/i.test(String(v || '').trim()))) return true;
  // Engine's fallback when no explicit image source is configured.
  try { return new URL(String(c.baseUrl || '')).hostname.toLowerCase() === 'image.novelai.net'
    || new URL(String(c.baseUrl || '')).hostname.toLowerCase() === 'api.novelai.net'; }
  catch (_) { return false; }
}
function records(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.connections)
    ? payload.connections : Array.isArray(payload?.items) ? payload.items : [];
  if (!shapePrinted && list.length) {
    shapePrinted = true;
    const safeKeys = obj => obj && typeof obj === 'object'
      ? Object.keys(obj).filter(k => /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(k)).slice(0, 30)
      : [];
    console.info('[gacha-novelai-delay] shape: connectionKeys=' + JSON.stringify(safeKeys(list[0])));
    for (const field of ['config','settings','params','metadata']) {
      if (list[0] && typeof list[0][field] === 'object' && list[0][field])
        console.info('[gacha-novelai-delay] shape: ' + field + 'Keys=' + JSON.stringify(safeKeys(list[0][field])));
    }
  }
  for (const c of list) if (c && c.id) known.set(String(c.id), providerIsNovelAi(c));
  diagnostic('connections metadata loaded; count=' + list.length + '; novelaiRecognized=' + [...known.values()].filter(Boolean).length);
}
function isGachaCall() {
  return /(?:^|[\\/])(?:gacha-forge[\\/]server\.mjs|gacha-forge-1\.8\.12-[^\\/]+[\\/]server\.mjs|gacha-forge[\\/]1\.8\.12[\\/]server\.mjs)(?::\d+)?/.test(new Error().stack || '');
}
function route(input) {
  try { return new URL(typeof input === 'string' ? input : input.url).pathname; } catch { return ''; }
}
function randomDelay() { return LOW + Math.floor(Math.random() * (HIGH - LOW + 1)); }
if (typeof originalFetch === 'function') {
  globalThis.fetch = async function gachaNovelAiDelay(input, init) {
    const path = route(input);
    const relevant = path === '/api/connections' || path === '/api/characters/avatar-generation';
    const gacha = isGachaCall();
    if (path === '/api/characters/avatar-generation' && avatarLogged++ < 4)
      console.info('[gacha-novelai-delay] image route seen; gachaStack=' + gacha + '; methodPost=' + (str(init?.method) === 'post'));
    if (relevant) diagnostic('route=' + (path === '/api/connections' ? 'connections' : 'avatar-generation') + '; gachaStack=' + gacha + '; methodPost=' + (str(init?.method) === 'post'));
    if (!gacha) return originalFetch.apply(this, arguments);
    if (path === '/api/connections') {
      const response = await originalFetch.apply(this, arguments);
      if (response.ok) try { records(await response.clone().json()); } catch (_) {}
      return response;
    }
    if (path !== '/api/characters/avatar-generation' || str(init?.method) !== 'post') {
      return originalFetch.apply(this, arguments);
    }
    let id;
    try { id = String(JSON.parse(init.body).connectionId || ''); }
    catch (_) { return originalFetch.apply(this, arguments); }
    if (!known.get(id)) {
      diagnostic('image request passthrough; connectionKnown=' + known.has(id) + '; recognizedNovelAi=false');
      return originalFetch.apply(this, arguments);
    }
    const hadPrevious = delays.has(id);
    const previous = delays.get(id) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    delays.set(id, current);
    try {
      await previous.catch(() => {});
      if (hadPrevious) {
        const ms = randomDelay();
        console.info(`[gacha-novelai-delay] waiting ${ms}ms before next NovelAI image request`);
        await sleep(ms);
      } else {
        console.info('[gacha-novelai-delay] first NovelAI image request (no delay)');
      }
      return await originalFetch.apply(this, arguments);
    } finally {
      release();
      // Keep the settled tail: future calls to this connection still wait.
    }
  };
  console.info('[gacha-novelai-delay] preload loaded; NovelAI-only gating is active when provider metadata is recognized');
}
