'use strict';
const assert = require('node:assert/strict');
const originalSetTimeout = global.setTimeout;
const sleeps = [];
global.setTimeout = (fn, ms) => { sleeps.push(ms); queueMicrotask(fn); };
const sent = [];
global.fetch = async (url, opts) => {
  if (String(url).endsWith('/api/connections')) {
    return new Response(JSON.stringify([{id:'novel',provider:'novelai'},{id:'other',provider:'openai'}]),{status:200});
  }
  sent.push(JSON.parse(opts.body).connectionId);
  return new Response('{}', {status:200});
};
require('./novelai-gacha-delay.cjs');
const vm = require('node:vm');
const run = async id => {
  globalThis.__testId = id;
  return vm.runInThisContext('fetch("http://localhost/api/characters/avatar-generation",{method:"POST",body:JSON.stringify({connectionId:globalThis.__testId})})',{filename:'/app/packages/gacha-forge/server.mjs'});
};
(async () => {
  await vm.runInThisContext('fetch("http://localhost/api/connections")',{filename:'/app/packages/gacha-forge/server.mjs'});
  await run('novel'); await run('novel'); await run('other');
  assert.deepEqual(sent,['novel','novel','other']);
  assert.equal(sleeps.length,1);
  assert.ok(sleeps[0] >= 2000 && sleeps[0] <= 5000);
  console.log('PASS: NovelAI requests spaced, non-NovelAI unaffected');
})().catch(e => { console.error(e); process.exitCode=1; })
  .finally(() => { global.setTimeout=originalSetTimeout; });
