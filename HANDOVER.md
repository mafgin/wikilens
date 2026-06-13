# WikiLens — Handover

_Last updated: 2026-06-14 (Yosef)_

> First file to read on a cold start. Durable reference: `CLAUDE.md`. Plan:
> `~/.claude/plans/glowing-dancing-mountain.md`. Public repo:
> https://github.com/mafgin/wikilens

## 1. מה המטרה (Goal)
A public browser extension that exposes how Wikipedia's different **language
editions frame the same topic** differently — by reading the same article from
other editions, translated, side by side.

## 2. מה רוצים לעשות (What we want)
One clean full-screen view: the **source article plus N other-language editions
side by side, machine-translated**, all looking identical (Wikipedia's own
design). Free, private, zero per-user cost. Browse article-to-article with the
comparison following you. Ship to the Chrome Web Store (Phase A) then Firefox/AMO
(Phase B).

## 3. איפה אנחנו עומדים (Where we stand)
Feature-complete v1, **Mor-verified in the browser**, **public on GitHub**
(`mafgin/wikilens`, 17 commits, `main`) under a **PolyForm Noncommercial 1.0.0**
license. **Chrome store package is prepared.** Not yet submitted to the store.

## 4. מה בוצע (What's done)
- Full-screen multi-column reader (source rendered as a column + N translations,
  equal widths, mobile <540px); progressive block translation; IndexedDB cache;
  inline links preserved; in-window set navigation; persists across browsing;
  per-column language switch, show-source toggle, A−/A+ text size.
- Wikimedia-Codex minimal redesign (light, serif headings, `#3366cc`).
- **Open-sourced (noncommercial):** `LICENSE.md` (PolyForm NC), pushed public.
- **Chrome store prep:** Chrome build made **on-device-only** (dropped the
  `translate.googleapis.com` permission → nothing leaves the device); `PRIVACY.md`
  (collects nothing); `store/chrome/listing.md` (name/summary/description/single-
  purpose/permission justifications/asset checklist); packaged
  `extension/wikilens-chrome-0.1.0.zip` (18 files, clean).

## 5. איך בוצע (How it was done)
Vanilla JS, no bundler, MV3, global `WL` namespace; 100% client-side (no backend,
no key). Chrome = built-in on-device Translator API; Firefox (Phase B) = keyless
Google fallback (the known weak link). Key files: `extension/src/content.js`,
`lib/wiki.js`, `lib/providers.js`, `lib/cache.js`, `background.js`. Build:
`extension/build.sh` → `dist-{chrome,firefox}/`. Depth:
[[project_wikilens_2026_06_13]] memory + the approved plan.

## 6. מה חוסם (What's blocking)
Nothing hard for Chrome. For **Firefox (Phase B)** the unofficial Google endpoint
is a real store-review risk — must be replaced (self-host LibreTranslate / BYOK)
or disclosed, and the `data_collection_permissions: ["none"]` reconciled with the
fact that it transmits article text.

## 7. למה מחכים (What we're waiting for)
Mor, for the Chrome submission: (a) Chrome developer account ($5 + 2FA);
(b) screenshots (≥1, 1280×800 — GUI needed; can do via RustDesk);
(c) name/trademark check; (d) the actual upload + form fill.

## 8. מה הצעד הבא (Next step)
1. Chrome Web Store submission — upload `wikilens-chrome-0.1.0.zip`, paste
   `store/chrome/listing.md`, set privacy URL
   (`…/blob/main/PRIVACY.md`), add screenshots → submit for review.
2. Phase B (Firefox): decide the translation source, reconcile data-collection
   disclosure, `web-ext sign` → AMO.
3. Optional polish: `CONTRIBUTING.md`, screenshots in README, per-column drag-resize.
4. Later (deferred): opt-in anonymized analytics; LLM bias-comparison (Gemini Nano).

## 9. איפה עצרנו (Where we stopped)
Last actions: open-sourced under PolyForm NC, pushed to `github.com/mafgin/wikilens`
(public), prepared the Chrome store package (on-device manifest + PRIVACY +
listing + zip), then ran `/update`. Chrome submission is Mor's to drive from here.
