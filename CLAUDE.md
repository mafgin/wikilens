# WikiLens — Cross-Language Wikipedia Comparator

> **Cold start: read `ONBOARDING.md` first** — live status + next steps. This
> file is the durable reference for what WikiLens is and how it's built.

## What

A Chrome + Firefox browser extension. While you read a Wikipedia article in one
language, WikiLens splits the window in two and shows the **same article from
another language edition**, machine-translated into your reading language, side
by side — so you can see how Wikipedia's different language editions frame the
same topic (political bias). Read "Capitalism" in English → pick Russian → read
the Russian article in English next to the original.

## Core design decisions (do not drift from these)

- **Public + free, zero per-user cost.** Everything runs **client-side in the
  user's own browser**. There is **no backend, no API key, no server**. Mor's
  cost is $0 per user forever (only a one-time ~$5 Chrome Web Store fee).
- **Finding the parallel article is free** — Wikipedia's `langlinks` API,
  CORS-enabled (`origin=*`), no key, called straight from the content script.
- **Translation is free, per browser:**
  - **Chrome/Edge (138+):** the built-in **on-device Translator API** — free,
    private, covers Hebrew/Russian/Arabic. Runs in the content context.
  - **Firefox:** the keyless `translate.googleapis.com` endpoint, run from the
    background (CORS). This is the **known weak link** — unofficial, can break,
    may draw AMO scrutiny. Mozilla's on-device engine lacks Hebrew/Arabic, so
    there's no clean on-device path on Firefox today.
- **v1 = translate-only.** The bias *comparison* layer (structural diff;
  on-device Gemini-Nano narrative analysis) is deferred. See ONBOARDING.
- **Analytics deferred** (Mor's call). If ever added it must be opt-in,
  anonymized + aggregate-only, with a privacy policy + store disclosure. The
  on-device translation stays private regardless.

## Architecture

```
Wikipedia page (content script)
  content.js   ── splits the page; mounts the right pane (Shadow DOM)
  lib/wiki.js  ── langlinks + fetch + clean the target article (CORS, no key)
  lib/providers.js ─ on-device Translator (Chrome) here; Google fallback in bg
        │ runtime.sendMessage
        ▼
  background.js ── owns IndexedDB cache (extension origin) + Google fetch (CORS)
```

No network leaves the browser except: MediaWiki API calls (from the user's own
IP) and, on Firefox only, the Google fallback.

## File map (`extension/src/`)

- `manifest.chrome.json` / `manifest.firefox.json` — MV3. Chrome uses a
  `service_worker` (classic, so `importScripts` works); Firefox uses
  `background.scripts[]` + `browser_specific_settings.gecko`.
- `content.js` — split-screen UI, language picker, orchestration.
- `background.js` — message broker: `cache-get`, `cache-put`, `translate-google`.
- `lib/browser-polyfill.js` — aliases `browser = chrome` (Chrome MV3 promises).
- `lib/wiki.js` — MediaWiki client + HTML→prose-blocks cleaner (ported idea from
  `daniel/bot/ai.py::_TextExtractor`).
- `lib/providers.js` — `translateBuiltin` (content) + `googleTranslateBatch` (bg).
- `lib/cache.js` — IndexedDB; key `(targetLang, title, revid, readingLang)`.
- `lib/render.js` — translated blocks → DOM in the pane.
- `lib/rtl.js` — RTL language detection.
- `popup.*`, `options.*` — toolbar popup + settings (reading lang, engine). No
  secrets stored.
- `build.sh` — copies `src/` → `dist-{chrome,firefox}/`, swaps the manifest.

Everything is plain vanilla JS attaching to a global `WL` namespace (no bundler,
no ES modules), matching the `daniel/firefox-addon` house style. Libs load via
manifest `content_scripts` order (content) and `importScripts`/`background.scripts`
(background).

## Build / load / sign

- `extension/build.sh` → `dist-chrome/`, `dist-firefox/`.
- Chrome dev: `chrome://extensions` → Developer mode → Load unpacked →
  `dist-chrome/`.
- Firefox dev: `about:debugging` → Load Temporary Add-on → `dist-firefox/manifest.json`.
- Firefox sign: `cd dist-firefox && web-ext sign --channel=…` → `.xpi`; publish
  via `dashboard/scripts/publish-download.sh` (precedent: the save-to-daniel xpi).
- Chrome public: Chrome Web Store (one-time $5 + review).

## Conventions

- Per-project docs required (this `CLAUDE.md` + `ONBOARDING.md`).
- Commit schema per the global CLAUDE.md (`[agent:yosef] [type:…] …`).
- Keep the store name/description **neutral** ("compare Wikipedia language
  editions"), not partisan — eases review, broadens appeal.
