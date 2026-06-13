# WikiLens — Handover

_Last updated: 2026-06-13 (Yosef)_

> First file to read on a cold start. Durable reference: `CLAUDE.md`. Plan:
> `~/.claude/plans/glowing-dancing-mountain.md`.

## 1. מה המטרה (Goal)
A public Chrome + Firefox browser extension that exposes how Wikipedia's
different **language editions frame the same topic** differently (political
bias) — by letting you read the same article from other editions, translated,
next to each other.

## 2. מה רוצים לעשות (What we want)
Read any Wikipedia article and, in one clean full-screen view, see the **source
article plus N other-language editions side by side, all machine-translated**
into your reading language, all looking identical (Wikipedia's own design).
Free for everyone, private, zero per-user cost. Browse article-to-article with
the comparison following you.

## 3. איפה אנחנו עומדים (Where we stand)
Feature-complete for a v1 and committed (standalone repo `Projects/wikilens`,
through ~`c2a64b7`). `web-ext lint` = 0 errors. **Verified headlessly only**
(syntax + lint + jsdom against real article HTML + live MediaWiki/Google
contracts). Not yet run in a real GUI browser — that's the one open gate.

## 4. מה בוצע (What's done)
- Full-screen multi-column reader: **source rendered as the first column** by our
  own pipeline + N translation columns, equal widths, mobile layout <540px/column.
- Free translation: **Chrome/Edge on-device Translator API**; **Firefox** keyless
  Google fallback (background). Discovery via MediaWiki `langlinks` (no key).
- Renders real Wikipedia structure (headings/images/infobox/tables), strips nav
  chrome by ARIA role + class, wraps wide tables to scroll, flips RTL→LTR.
- **Progressive** block translation (paint per block, top-first, concurrency 6),
  IndexedDB cache keyed on revid, **inline links preserved** (re-link by anchor).
- "+" adds language columns; per-column language switch; show-source toggle;
  A−/A+ text size; **in-window link nav** that moves the whole set; **state
  persists across navigation** (`wlActive`/`wlLangs`).
- Minimal **Wikimedia-Codex** redesign (light, serif headings, `#3366cc`); popup
  + options restyled. Icons, `build.sh`, both MV3 manifests, CLAUDE/ONBOARDING/
  README/CATALOG, git repo.

## 5. איך בוצע (How)
Vanilla JS, no bundler, MV3, global `WL` namespace (reuses `daniel/firefox-addon`
idioms). All client-side — **no backend, no API key**. Key files:
`extension/src/content.js` (UI + orchestration), `lib/wiki.js` (MediaWiki +
clean/build), `lib/providers.js` (on-device + Google), `lib/cache.js`,
`lib/render.js`, `background.js` (cache + Google CORS fetch). Build:
`extension/build.sh` → `dist-{chrome,firefox}/`. Rationale in
[[project_wikilens_2026_06_13]] memory + the approved plan file.

## 6. מה חוסם (Blocking)
Nothing hard. One **unverified assumption**: that Chrome's `self.Translator` is
reachable from a content script (mini runs Chrome 148, so very likely yes). If
not → move the on-device call to an offscreen document (small change). Secondary
weak link: the Firefox Google endpoint is unofficial (can rate-limit / draw AMO
scrutiny).

## 7. למה מחכים (Waiting for)
Mor to run it in a GUI browser and report behavior — especially whether the
on-device translation fires on Chrome (Network tab shows **no** translate call),
RTL renders, and the multi-column/mobile/links feel right.

## 8. מה הצעד הבא (Next step)
1. GUI run on the mini's Chrome (load `dist-chrome/` unpacked) → confirm Phase-0
   gate; fix to offscreen-document if `Translator` isn't in the content script.
2. Polish from Mor's feedback (per-column drag-resize is the one deferred item).
3. Ship: `web-ext sign` → `.xpi` (publish-download.sh / AMO) + Chrome Web Store.
4. Later (deferred): opt-in anonymized analytics (privacy policy + store
   disclosure); the LLM bias-comparison layer (on-device Gemini Nano).

## 9. איפה עצרנו (Where we stopped)
Last action: refactored the source to render as a column (full-screen unified
design), committed `c2a64b7`, then ran `/update`. Extension is built in
`extension/dist-chrome` and `dist-firefox`, ready to load. Mor was iterating on
design/UX live; he should reload the unpacked extension to see the latest.
