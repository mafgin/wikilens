# Chrome Web Store — listing copy & submission notes

Copy-paste source for the Chrome Web Store developer console. Phase A = Chrome
(on-device only). Firefox/AMO is Phase B (separate, because of the online
fallback).

## Package

The Chrome build is **on-device only** — `manifest.chrome.json` does NOT request
`translate.googleapis.com` (translation runs through the browser's built-in
Translator API), so nothing about what you read leaves the device.

Build + zip the upload artifact:

```
cd extension && ./build.sh
cd dist-chrome && zip -rq ../wikilens-chrome-0.1.0.zip .
```

Upload `extension/wikilens-chrome-0.1.0.zip` (manifest.json at the zip root).

## Item name (≤75 chars)

WikiLens — Compare Wikipedia Language Editions

## Summary (≤132 chars)

Read a Wikipedia article from another language edition, translated, side by side —
see how each edition frames the same topic.

## Category

Education

## Language

English (listing); the extension itself works in any language.

## Detailed description

WikiLens lets you read the same Wikipedia article from other language editions,
machine-translated into your language, side by side with the one you're on — so
you can see how Wikipedia's different language editions frame the same topic.

Open any Wikipedia article, click WikiLens, and the page becomes a clean,
Wikipedia-style reading view with the source article and the editions you choose
(Russian, Hebrew, Arabic, German, …) as equal columns. Add languages with “+”,
switch a column's language, toggle the untranslated original, resize text, and
browse from article to article with the comparison following you.

Private by design:
• Translation happens entirely on your device (Chrome's built-in translator).
• Nothing about what you read is sent to any server. No accounts, no tracking,
  no analytics.
• The list of editions and the article text come straight from Wikipedia's
  public API, in your browser.

Notes:
• Desktop only — the on-device translator isn't available on mobile browsers.
• Requires Chrome/Edge 138 or newer (the first translation of a language pair
  downloads a small on-device model once).
• Free and noncommercial (PolyForm Noncommercial license).

## Single purpose (required field)

Compare a Wikipedia article across language editions by displaying other
editions, machine-translated, side by side with the current article.

## Permission justifications (review form)

- **activeTab** — to detect the Wikipedia article in the current tab when the
  user clicks the toolbar button; no access until the user acts.
- **storage** — to save the user's preferences (reading language, text size,
  chosen comparison languages, panel state) locally.
- **Host permission `https://*.wikipedia.org/*`** — to read the current article
  and fetch its parallel-language editions from Wikipedia's API to build the
  side-by-side comparison.

## Privacy

- Privacy policy URL: https://github.com/mafgin/wikilens/blob/main/PRIVACY.md
- Data collection disclosures: **does not collect or transmit** any user data.
  Article content is accessed but processed locally and never transmitted.
- Certifications: does not sell/transfer data; no use unrelated to the single
  purpose; complies with the Developer Program Policies.

## Assets still needed (Mor)

- **Developer account** — one-time $5 registration + 2FA enabled.
- **Screenshots** — at least 1 (1280×800 or 640×400), up to 5. Suggested shots:
  (1) en + ru + he three-column compare on “Capitalism”; (2) the “+” language
  picker; (3) “show original” toggle; (4) a mobile-narrow column.
- **(Optional)** 440×280 small promo tile.
- **Name/trademark check** before publishing.

## Review risks to expect

- Broad-ish host match `*.wikipedia.org` — justified above.
- Desktop-only behavior — stated in the description to avoid “doesn't work”
  reviews from mobile users.
- Single-purpose — clean (one function).
