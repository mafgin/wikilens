# WikiLens

Read a Wikipedia article from **another language edition**, machine-translated,
**side by side** with the one you're on — and see how each edition frames the
same topic.

You're reading *Capitalism* on English Wikipedia. Click WikiLens, pick Russian,
and the window splits in two: the English article on the left, the Russian
article — translated into English — on the right.

## Private + free

Everything runs **in your browser**. What you read is never sent to a server.

- On **Chrome / Edge** (138+) translation happens **on-device** via the
  browser's built-in translator — no network, no key, no cost.
- On **Firefox** translation uses a free online fallback (Firefox has no
  on-device engine for Hebrew/Arabic yet).

Desktop only (the on-device translator isn't available on mobile browsers).

## Install (development)

```
cd extension && ./build.sh
```

- **Chrome / Edge:** open `chrome://extensions`, turn on **Developer mode**,
  click **Load unpacked**, choose `extension/dist-chrome/`.
- **Firefox:** open `about:debugging` → **This Firefox** → **Load Temporary
  Add-on…** → pick `extension/dist-firefox/manifest.json`. You may need to grant
  the `translate.googleapis.com` permission in **about:addons → Permissions** for
  the translation fallback.

## Use

1. Open any Wikipedia article.
2. Click the **WikiLens** toolbar icon → **Compare editions**.
3. Pick a language from the dropdown (the list is every parallel edition that
   exists for this article).
4. The right pane shows that edition translated into your reading language.
   Re-opening the same article is instant (the translation is cached locally).

**Settings** (toolbar → Settings): choose which language to translate *into*, and
the translation engine (auto / on-device only / free online fallback).

## How it works

- The list of other-language editions comes from Wikipedia's own `langlinks`
  API — free and public.
- The target article is fetched and reduced to clean prose, then translated
  block by block.
- Translations are cached in your browser keyed on the article's revision id, so
  they only re-translate when the article is actually edited.

## Notes

- The Firefox online fallback is unofficial and can occasionally rate-limit or
  fail; on-device Chrome/Edge is the robust path.
- WikiLens is for comparison and reading. Machine translation can paraphrase —
  for anything load-bearing, check the original.
