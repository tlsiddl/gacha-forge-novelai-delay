'use strict';
// Independent experimental preload for Gacha Forge -> Engine image requests.
// Does not modify Marinara/Gacha Forge source files.
const originalFetch = globalThis.fetch;
const delays = new Map();
const known = new Map();
const LOW = 2000, HIGH = 5000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const str = value => typeof value === 'string' ? value.toLowerCase() : '';
function providerIsNovelAi(c) {
  if (!c || typeof c !== 'object') return false;
  const values = [c.provider, c.imageProvider, c.service, c.providerType, c.apiType,
    c.config?.provider, c.settings?.provider, c.source];
  return values.some(v => /^novel[\s_-]?ai$/i.test(String(v || '').trim()));
}
function records(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.connections)
    ? payload.connections : Array.isArray(payload?.items) ? payload.items : [];
  for (const c of list) if (c && c.id) known.set(String(c.id), providerIsNovelAi(c));
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
    if (!isGachaCall()) return originalFetch.apply(this, arguments);
    const path = route(input);
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
    if (!known.get(id)) return originalFetch.apply(this, arguments);
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
