/**
 * Translation providers. Two free paths, no API key, no per-user cost:
 *
 *   Chrome built-in on-device Translator API (Chrome/Edge 138+) — free, private,
 *     covers Hebrew/Russian/Arabic. Runs in the CONTENT context.
 *   Google free keyless endpoint — Firefox fallback. Runs in the BACKGROUND
 *     (cross-origin needs host_permissions). Unofficial / fragile — weak link.
 *
 * Both expose a `*Texts(strings[]) -> strings[]` shape: the renderer collects the
 * unique strings of an article and translates them in one pass, then writes them
 * back in place so Wikipedia's structure/styling is preserved.
 */
(function () {
  const WL = (globalThis.WL = globalThis.WL || {});

  /* ---------------- Chrome built-in on-device Translator --------------- */

  function builtinAvailable() {
    return typeof self !== "undefined" && "Translator" in self;
  }

  async function builtinStatus(src, dst) {
    if (!builtinAvailable()) return "unavailable";
    try {
      return await self.Translator.availability({
        sourceLanguage: src,
        targetLanguage: dst,
      });
    } catch {
      return "unavailable";
    }
  }

  const _translators = new Map();
  async function getTranslator(src, dst, onDownload) {
    const k = `${src}>${dst}`;
    if (_translators.has(k)) return _translators.get(k);
    const t = await self.Translator.create({
      sourceLanguage: src,
      targetLanguage: dst,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          if (onDownload) onDownload(e.loaded, e.total);
        });
      },
    });
    _translators.set(k, t);
    return t;
  }

  // Translate an array of strings on-device, with bounded concurrency so a big
  // article doesn't crawl through hundreds of sequential calls.
  async function translateBuiltinTexts(texts, src, dst, onProgress, onDownload) {
    const t = await getTranslator(src, dst, onDownload);
    const out = new Array(texts.length);
    let next = 0;
    let done = 0;
    const CONC = 6;
    async function worker() {
      while (next < texts.length) {
        const i = next++;
        try {
          out[i] = await t.translate(texts[i]);
        } catch {
          out[i] = texts[i];
        }
        done++;
        if (onProgress && done % 8 === 0) onProgress(done, texts.length);
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));
    if (onProgress) onProgress(texts.length, texts.length);
    return out;
  }

  /* ------------------- Free keyless Google fallback -------------------- */

  function splitForUrl(text, max) {
    max = max || 1400;
    if (text.length <= max) return [text];
    const parts = [];
    let rest = text;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max * 0.5) cut = max;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) parts.push(rest);
    return parts;
  }

  async function googleOne(text, src, dst) {
    const results = [];
    for (const part of splitForUrl(text)) {
      const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
        `&sl=${encodeURIComponent(src)}&tl=${encodeURIComponent(dst)}` +
        `&q=${encodeURIComponent(part)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`google ${resp.status}`);
      const data = await resp.json();
      results.push((data[0] || []).map((seg) => seg[0]).join(""));
    }
    return results.join("");
  }

  async function googleTranslateTexts(texts, src, dst, onProgress) {
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      try {
        out.push(await googleOne(texts[i], src, dst));
      } catch {
        out.push(texts[i]);
      }
      if (onProgress) onProgress(i + 1, texts.length);
      await new Promise((r) => setTimeout(r, 90)); // pace the unofficial endpoint
    }
    return out;
  }

  WL.providers = {
    builtinAvailable,
    builtinStatus,
    translateBuiltinTexts,
    googleTranslateTexts,
  };
})();
