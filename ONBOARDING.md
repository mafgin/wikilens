# WikiLens — Onboarding / Live Status

Cold-start tour + where we are. Durable reference is `CLAUDE.md`.

## Status — 2026-06-13

**Status now lives in `HANDOVER.md` (the 9-section snapshot) — read it first.**
The notes below are the original v1 scaffold tour; the project has since grown
into a full-screen multi-column comparison reader (see HANDOVER).
Original note: Phase 1 MVP built (translate-only, both browsers), not yet hardware-tested.
The full extension is scaffolded and `web-ext lint`-clean. It needs a real
browser run on the Mac mini's GUI session to confirm the Chrome on-device
Translator path end-to-end (Phase 0 gate in the plan).

What exists:
- Full `extension/src/` (content split-screen, language picker from `langlinks`,
  on-device + Google translation, IndexedDB cache, popup, options, icons).
- `build.sh` producing `dist-chrome/` + `dist-firefox/`.
- Both MV3 manifests.

## How to try it

```
cd extension && ./build.sh
```
- **Chrome/Edge:** `chrome://extensions` → Developer mode → Load unpacked →
  `extension/dist-chrome/`. Open `https://en.wikipedia.org/wiki/Capitalism` →
  click the WikiLens toolbar icon → "Compare editions" → pick Russian / Hebrew.
- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on →
  `extension/dist-firefox/manifest.json`. (Firefox MV3 may ask you to grant the
  `translate.googleapis.com` host permission in about:addons → Permissions for
  the fallback to work.)

## Open verification points (carry these into the next session)

1. **Chrome Translator API context** — confirm `self.Translator` is reachable
   from the *content script* (not just an extension page). If not, move the
   on-device call to an offscreen document. This gates the whole Chrome story.
   (Network tab should show **no** external translate request on Chrome.)
2. **Service-worker lifetime** isn't an issue for the on-device path (it runs in
   the content script), but watch the Google path for very long articles.
3. **Firefox host-permission grant** for `translate.googleapis.com` — verify the
   fallback actually fires after granting.
4. **RTL** — check a Hebrew/Arabic source renders correctly in the right pane.
5. **Long articles** — "Capitalism"-class pages: confirm chunking + pacing don't
   trip the Google rate limit (Firefox only).

## Next steps (from the approved plan)

- Phase 2/3 polish: graceful "language pack unavailable" state; synchronized
  scroll between panes; Wikipedia language-code → BCP-47 mapping for edge codes
  (simple, nb/nn, zh variants).
- Ship: `web-ext sign` → `.xpi` + Chrome Web Store submission.
- **Later (deferred):** usage analytics (opt-in, anonymized, privacy policy +
  store disclosure); the bias-comparison layer (structural diff + on-device
  Gemini-Nano narrative analysis).

## Plan file

`~/.claude/plans/glowing-dancing-mountain.md` — the approved implementation plan.
