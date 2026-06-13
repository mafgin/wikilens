/**
 * Translation providers. Two free paths, no API key, no per-user cost:
 *
 *   ChromeBuiltinProvider — Chrome/Edge 138+ on-device Translator API. Free,
 *     private, covers Hebrew/Russian/Arabic. Runs in the CONTENT context (a
 *     real window) where the global is reliably exposed.
 *
 *   GoogleFreeProvider — keyless translate.googleapis.com endpoint. The Firefox
 *     fallback (Mozilla's on-device engine lacks Hebrew/Arabic). Unofficial /
 *     fragile — documented weak link. Runs in the BACKGROUND context where the
 *     extension's host_permissions grant the cross-origin fetch.
 *
 * This file is loaded in both contexts; each context calls the half it needs.
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

  async function translateBuiltin(blocks, src, dst, onProgress, onDownload) {
    const t = await getTranslator(src, dst, onDownload);
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      let text = blocks[i].text;
      try {
        text = await t.translate(blocks[i].text);
      } catch {
        // keep source text for this block rather than abort the whole article
      }
      out.push({ tag: blocks[i].tag, text });
      if (onProgress) onProgress(i + 1, blocks.length);
    }
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

  async function googleTranslateBatch(blocks, src, dst, onProgress) {
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      let text = blocks[i].text;
      try {
        text = await googleOne(blocks[i].text, src, dst);
      } catch {
        // leave original text for this block on failure
      }
      out.push({ tag: blocks[i].tag, text });
      if (onProgress) onProgress(i + 1, blocks.length);
      // gentle pacing to avoid an IP rate-limit on the unofficial endpoint
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  WL.providers = {
    builtinAvailable,
    builtinStatus,
    translateBuiltin,
    googleTranslateBatch,
  };
})();
