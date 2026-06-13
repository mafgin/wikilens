/**
 * WikiLens content script — runs on *.wikipedia.org/wiki/*.
 *
 * Splits the window in two: the live Wikipedia article narrows to the left half,
 * and a right pane (Shadow DOM, so page CSS can't bleed in and vice versa) shows
 * the same article from another language edition, machine-translated.
 *
 * Flow on language pick:
 *   fetch + clean the target article (wiki.js)  →  ask background for a cached
 *   translation  →  on miss, translate (on-device in this context, or Google via
 *   background)  →  render  →  cache the result.
 */
(function () {
  const WL = globalThis.WL;
  const bg = (msg) => browser.runtime.sendMessage(msg);

  const SPLIT_CLASS = "wikilens-split-active";
  const PANE_ID = "wikilens-pane";

  let host = null; // the right-pane host element (light DOM)
  let shadow = null;
  let isOpen = false;
  let current = null; // { lang, title } of the article we're reading
  let langlinks = null; // cached interlanguage links for this article

  const PANE_CSS = `
    .wl-root { display:flex; flex-direction:column; height:100vh; background:#0A0E1A;
      color:#F8FAFC; font-family:-apple-system, system-ui, 'Segoe UI', sans-serif;
      font-size:15px; box-sizing:border-box; }
    .wl-head { display:flex; align-items:center; gap:8px; padding:10px 12px;
      border-bottom:1px solid rgba(255,255,255,.08); background:#0F1420; }
    .wl-title { font-size:12px; font-weight:700; letter-spacing:.5px;
      text-transform:uppercase; color:#60A5FA; white-space:nowrap; }
    .wl-lang { flex:1; min-width:0; background:#0A0E1A; color:#F8FAFC;
      border:1px solid rgba(255,255,255,.12); border-radius:6px; padding:6px 8px;
      font-size:13px; }
    .wl-close { background:rgba(255,255,255,.08); color:#F8FAFC; border:none;
      border-radius:6px; width:30px; height:30px; cursor:pointer; font-size:14px;
      flex:none; }
    .wl-close:hover { background:rgba(255,255,255,.16); }
    .wl-prov { padding:6px 12px; font-size:11px; color:rgba(255,255,255,.45);
      border-bottom:1px solid rgba(255,255,255,.05);
      font-family:ui-monospace, SFMono-Regular, monospace; }
    .wl-prov:empty { display:none; }
    .wl-status { padding:8px 12px; font-size:12px; color:#60A5FA; display:none; }
    .wl-status.err { color:#EF4444; }
    .wl-body { padding:16px 18px 48px; overflow-y:auto; line-height:1.6; flex:1; }
    .wl-arttitle { font-size:22px; font-weight:700; margin:0 0 14px; color:#fff; }
    .wl-body h2 { font-size:18px; margin:22px 0 8px; color:#93C5FD;
      border-bottom:1px solid rgba(255,255,255,.08); padding-bottom:4px; }
    .wl-body h3 { font-size:15px; margin:16px 0 6px; color:#BFDBFE; }
    .wl-body h4 { font-size:14px; margin:12px 0 4px; color:#BFDBFE; }
    .wl-body p { margin:0 0 10px; }
    .wl-body ul { margin:0 0 10px; padding-inline-start:20px; }
    .wl-body li { margin:0 0 4px; }
    .wl-body blockquote { margin:0 0 10px; padding-inline-start:12px;
      border-inline-start:3px solid rgba(96,165,250,.5); color:rgba(255,255,255,.8); }
  `;

  function ensureSplitStyle() {
    if (document.getElementById("wikilens-split-style")) return;
    const s = document.createElement("style");
    s.id = "wikilens-split-style";
    // The pane is fixed to the right half; narrowing the body by an equal margin
    // keeps the live article fully visible in the left half (no overlap).
    s.textContent = `
      html.${SPLIT_CLASS} body { margin-right: 50vw !important; }
      #${PANE_ID} { position: fixed; top: 0; right: 0; width: 50vw; height: 100vh;
        z-index: 2147483647; box-shadow: -2px 0 14px rgba(0,0,0,.35); }
      @media (max-width: 720px) {
        html.${SPLIT_CLASS} body { margin-right: 0 !important; }
        #${PANE_ID} { width: 100vw; }
      }
    `;
    document.documentElement.appendChild(s);
  }

  // Tiny DOM builder — avoids innerHTML so there's no unsafe-assignment surface
  // and external strings can never be interpreted as markup.
  function mk(tag, props, kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === "class") e.className = props[k];
        else if (k === "text") e.textContent = props[k];
        else e.setAttribute(k, props[k]);
      }
    }
    (kids || []).forEach((c) => e.appendChild(c));
    return e;
  }

  function setOptions(sel, opts) {
    sel.replaceChildren();
    opts.forEach((o) => {
      const op = document.createElement("option");
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
  }

  function buildPane() {
    if (host) return;
    ensureSplitStyle();
    host = document.createElement("div");
    host.id = PANE_ID;
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = PANE_CSS;

    const sel = mk("select", { id: "wl-lang", class: "wl-lang" });
    setOptions(sel, [{ value: "", label: "… loading" }]);

    const root = mk("div", { class: "wl-root" }, [
      mk("header", { class: "wl-head" }, [
        mk("div", { class: "wl-title", text: "WikiLens" }),
        sel,
        mk("button", { id: "wl-close", class: "wl-close", title: "Close", text: "✕" }),
      ]),
      mk("div", { id: "wl-prov", class: "wl-prov" }),
      mk("div", { id: "wl-status", class: "wl-status" }),
      mk("article", { id: "wl-body", class: "wl-body", dir: "auto" }),
    ]);

    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    shadow.getElementById("wl-close").addEventListener("click", () => toggle(false));
    sel.addEventListener("change", (e) => onPickLanguage(e.target.value));
  }

  const el = (id) => shadow && shadow.getElementById(id);

  function setStatus(text, kind) {
    const s = el("wl-status");
    if (!s) return;
    s.textContent = text || "";
    s.className = "wl-status" + (kind ? " " + kind : "");
    s.style.display = text ? "block" : "none";
  }

  function setProvenance(text) {
    const p = el("wl-prov");
    if (p) p.textContent = text || "";
  }

  async function toggle(force) {
    isOpen = typeof force === "boolean" ? force : !isOpen;
    if (isOpen) {
      buildPane();
      document.documentElement.classList.add(SPLIT_CLASS);
      host.style.display = "block";
      await initLanguages();
    } else if (host) {
      host.style.display = "none";
      document.documentElement.classList.remove(SPLIT_CLASS);
    }
    return isOpen;
  }

  async function initLanguages() {
    if (langlinks) return;
    current = WL.wiki.getCurrentArticle();
    setStatus("finding other language editions…", "");
    try {
      langlinks = await WL.wiki.fetchLangLinks(current.lang, current.title);
    } catch (e) {
      setStatus("could not load language list: " + e.message, "err");
      return;
    }
    const sel = el("wl-lang");
    if (!langlinks.length) {
      setOptions(sel, [{ value: "", label: "no other editions" }]);
      setStatus("This article has no parallel editions in other languages.", "");
      return;
    }
    langlinks.sort((a, b) => a.langname.localeCompare(b.langname));
    setOptions(sel, [
      { value: "", label: "choose a language…" },
      ...langlinks.map((l) => ({
        value: l.lang,
        label: `${l.langname} — ${l.autonym}`,
      })),
    ]);
    setStatus("", "");

    const { lastTargetLang } = await browser.storage.local.get("lastTargetLang");
    if (lastTargetLang && langlinks.some((l) => l.lang === lastTargetLang)) {
      sel.value = lastTargetLang;
      onPickLanguage(lastTargetLang);
    }
  }

  async function readingLang() {
    const { readingLang } = await browser.storage.local.get("readingLang");
    if (readingLang && readingLang !== "auto") return readingLang;
    return current.lang; // default: the language of the wiki you're reading
  }

  async function onPickLanguage(lang) {
    if (!lang) return;
    const target = langlinks.find((l) => l.lang === lang);
    if (!target) return;
    browser.storage.local.set({ lastTargetLang: lang });

    const dst = await readingLang();
    const body = el("wl-body");
    body.replaceChildren();
    setProvenance("");
    setStatus("fetching " + target.langname + " article…", "");

    let article;
    try {
      article = await WL.wiki.fetchArticle(target.lang, target.title);
    } catch (e) {
      setStatus("could not fetch the article: " + e.message, "err");
      return;
    }
    if (!article.blocks.length) {
      setStatus("the source article appears to be empty.", "err");
      return;
    }

    const meta = {
      targetLang: target.lang,
      title: target.title,
      revid: article.revid,
      readingLang: dst,
    };

    // cache check (extension-origin store owned by the background)
    let cached = null;
    try {
      const r = await bg({ type: "cache-get", meta });
      cached = r && r.value;
    } catch {}
    if (cached) {
      render(cached, target, dst, article, "cached");
      return;
    }

    let translated;
    let via;
    if (target.lang === dst) {
      translated = article.blocks;
      via = "original";
    } else {
      try {
        const r = await translate(article.blocks, target.lang, dst);
        translated = r.blocks;
        via = r.via;
      } catch (e) {
        setStatus("translation failed: " + e.message, "err");
        return;
      }
    }
    render(translated, target, dst, article, via);
    bg({ type: "cache-put", meta, value: translated }).catch(() => {});
  }

  async function translate(blocks, src, dst) {
    const { provider } = await browser.storage.local.get("provider");
    const mode = provider || "auto";

    if (mode !== "google" && WL.providers.builtinAvailable()) {
      const status = await WL.providers.builtinStatus(src, dst);
      if (status !== "unavailable") {
        if (status !== "available") {
          setStatus("preparing on-device translator (one-time download)…", "");
        }
        const out = await WL.providers.translateBuiltin(
          blocks,
          src,
          dst,
          (d, t) => setStatus(`translating ${d}/${t}…`, ""),
          (l, t) =>
            setStatus(`downloading translator ${Math.round((l / (t || 1)) * 100)}%…`, "")
        );
        setStatus("", "");
        return { blocks: out, via: "on-device" };
      }
      if (mode === "builtin") throw new Error(`on-device translator can't do ${src}→${dst}`);
    } else if (mode === "builtin") {
      throw new Error("on-device translator not available in this browser");
    }

    setStatus("translating…", "");
    const r = await bg({ type: "translate-google", blocks, src, dst });
    if (r && r.error) throw new Error(r.error);
    setStatus("", "");
    return { blocks: r.blocks, via: "google" };
  }

  function render(blocks, target, dst, article, via) {
    const body = el("wl-body");
    body.dir = WL.rtl.isRTL(dst) ? "rtl" : "ltr";
    body.replaceChildren();
    const h = document.createElement("h1");
    h.className = "wl-arttitle";
    h.textContent = article.displayTitle || target.title;
    h.dir = "auto";
    body.appendChild(h);
    WL.render.into(body, blocks);
    setProvenance(
      `${target.autonym} (${target.lang}) → ${dst} · rev ${article.revid} · ${via}`
    );
    setStatus("", "");
    body.scrollTop = 0;
  }

  // Messages from the popup.
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "ping") {
      sendResponse({
        ok: true,
        article: WL.wiki.isArticlePage() ? WL.wiki.getCurrentArticle() : null,
      });
    } else if (msg.type === "toggle") {
      if (!WL.wiki.isArticlePage()) {
        sendResponse({ ok: false, reason: "not-article" });
        return;
      }
      toggle().then((open) => sendResponse({ ok: true, open }));
      return true; // async sendResponse
    }
  });
})();
