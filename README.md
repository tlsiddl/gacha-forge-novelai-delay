# Gacha Forge · NovelAI Image Delay (experimental)

A **separate Node.js preload**, designed to add a random **2–5-second pause** between NovelAI image-generation requests initiated by Gacha Forge. It does **not** modify Marinara Engine or Gacha Forge source files.

> **Experimental:** Tested with a local mock, not on a live NovelAI account or this server. It only activates if Gacha Forge calls Node's global `fetch`, and `/api/connections` exposes a recognizable NovelAI provider field. If those assumptions are false, it will not throttle requests. This does **not** guarantee account safety or bypass service restrictions. Follow NovelAI's policies.

## Behavior
- First recognized NovelAI generation request: immediate.
- Subsequent requests: queued by connection; wait randomly **2,000–5,000 ms after the previous request completes**.
- Other image providers and non-Gacha requests are unchanged.
- Existing engine request results and errors are passed through (no custom retries).
- In-memory queue is per Node process, not shared across containers.

## Install (Docker Compose)
Copy `novelai-gacha-delay.cjs` into your Marinara Engine host folder (e.g. `/root/Marinara-Engine`). **Merge**, do not replace, your existing `docker-compose.override.yml` with the entries in `install-snippet.yml`.

If your existing speed-up patch uses `--require=/app/me-speedup.cjs`, keep it, and append `--require=/app/novelai-gacha-delay.cjs` to the same `NODE_OPTIONS`. Also bind-mount the new file read-only.

Validate and restart from the compose project directory:

```bash
docker compose config >/dev/null && echo 'Compose syntax OK'
docker compose up -d
docker compose logs --since=10m marinara | grep -F '[gacha-novelai-delay]'
```

## Verify actual operation

1. Confirm **preload initialized** (not evidence that requests were delayed):
```bash
docker compose logs --since=30m marinara | grep -F '[gacha-novelai-delay] preload loaded'
```
2. Trigger **two NovelAI-generated images in Gacha Forge**, then check:
```bash
docker compose logs --since=30m marinara | grep -E '\[gacha-novelai-delay\] (first NovelAI|waiting [0-9]+ms)'
```
Expected example: `first NovelAI image request (no delay)` followed by `waiting 3264ms before next NovelAI image request`.

**Note:** An initialization log alone does not prove functionality. If no per-request logs appear, the provider may not be identified or Gacha Forge may use an injected `fetch` instead. Do not treat the patch as active without request logs.

## Local test
```bash
node --check novelai-gacha-delay.cjs
node selftest.cjs
```
This is a mock test only, not an actual provider request.

## Remove
Remove only the new `--require` flag and the new volume mount, then run `docker compose up -d`. Keep any preexisting preload flags unchanged.
