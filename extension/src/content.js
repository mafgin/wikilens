/**
 * WikiLens content script — runs on *.wikipedia.org/wiki/*.
 *
 * Splits the window: the live Wikipedia article on the left; the right pane
 * holds one or more COLUMNS, each the same article from another language
 * edition, rendered with Wikipedia's structure and translated in place.
 *
 *   • "+" adds a column        — equal parts auto-divide (orig + N cols all the
 *                                same width); narrow columns → mobile layout.
 *   • Follows you as you browse — the split + chosen languages persist across
 *                                link clicks / navigation (Wikipedia is wandering
 *                                article to article).
 *   • Progressive translation  — original shows instantly, blocks translate
 *                                top-down as they're ready.
 *   • RTL→LTR                  — translating he/ar→en flips the whole column.
 */
(function () {
  const WL = globalThis.WL;
  const bg = (msg) => browser.runtime.sendMessage(msg);

  const SPLIT_CLASS = "wikilens-split-active";
  const PANE_ID = "wikilens-pane";
  const NARROW_PX = 360;
  const BLOCK_SEL =
    "p,li,h1,h2,h3,h4,h5,caption,th,td,dt,dd,blockquote,figcaption,.thumbcaption,.gallerytext";

  let host = null;
  let shadow = null;
  let isOpen = false;
  let current = null;
  let langlinks = null;
  const panes = new Map(); // lang -> open column
  const order = []; // open column langs, in display order
  let desired = []; // the chosen comparison languages (persisted, may exceed what
                    // this article has — missing ones reappear on articles that have them)
  let ro = null;

  /* ----------------------------- styling ----------------------------- */

  const PANE_CSS = `
    .wl-root { display:flex; flex-direction:column; height:100vh; background:#0A0E1A;
      color:#F8FAFC; font-family:-apple-system, system-ui, 'Segoe UI', sans-serif;
      font-size:14px; box-sizing:border-box; }
    .wl-head { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#0F1420; }
    .wl-brand { font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase;
      color:#60A5FA; white-space:nowrap; flex:1; }
    .wl-add { background:#60A5FA; color:#0A0E1A; border:none; border-radius:6px; height:26px;
      padding:0 10px; font-size:13px; font-weight:600; cursor:pointer; flex:none; }
    .wl-close { background:rgba(255,255,255,.08); color:#F8FAFC; border:none; border-radius:6px;
      width:26px; height:26px; cursor:pointer; flex:none; }
    .wl-close:hover { background:rgba(255,255,255,.16); }
    .wl-pickerbar { padding:6px 10px; background:#0F1420; }
    .wl-picker { width:100%; background:#0A0E1A; color:#fff; border:1px solid rgba(255,255,255,.15);
      border-radius:6px; padding:6px 8px; font-size:13px; }
    .wl-status { padding:6px 10px; font-size:12px; color:#60A5FA; background:#0F1420; display:none; }
    .wl-status.err { color:#EF4444; }
    .wl-articles { flex:1; display:flex; flex-direction:row; align-items:stretch; position:relative;
      overflow:hidden; background:#fff; }

    .wl-col { flex:1 1 0; min-width:0; display:flex; flex-direction:column; overflow:hidden;
      background:#fff; border-inline-start:1px solid #c8ccd1; }
    .wl-col:first-of-type { border-inline-start:none; }
    .wl-colhead { display:flex; align-items:center; gap:8px; padding:5px 10px; background:#f1f5f9;
      border-bottom:1px solid #e2e8f0; font-size:12px; color:#0f172a; }
    .wl-colname { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .wl-collang { font-weight:600; font-size:12px; border:1px solid #cbd5e1; border-radius:4px;
      background:#fff; color:#0f172a; padding:2px 6px; max-width:170px; cursor:pointer; }
    .wl-colstatus { flex:1; font-size:11px; color:#2563eb; font-family:ui-monospace,monospace;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .wl-colstatus.err { color:#dc2626; }
    .wl-colclose { cursor:pointer; opacity:.5; font-weight:700; flex:none; }
    .wl-colclose:hover { opacity:1; }

    .wl-article { flex:1; overflow:auto; padding:14px 18px 60px; color:#202122; background:#fff;
      font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; line-height:1.65; }
    .wl-article .wl-arttitle { font-family:Georgia,'Linux Libertine',serif; font-size:24px;
      font-weight:normal; margin:0 0 .4em; padding-bottom:.2em; border-bottom:1px solid #a2a9b1; color:#000; }
    .wl-article h2 { font-family:Georgia,serif; font-size:19px; font-weight:normal;
      border-bottom:1px solid #a2a9b1; padding-bottom:.2em; margin:1em 0 .4em; }
    .wl-article h3 { font-size:16px; margin:.9em 0 .3em; }
    .wl-article h4 { font-size:14px; margin:.7em 0 .3em; }
    .wl-article p { margin:.5em 0; }
    .wl-article a { color:#3366cc; text-decoration:none; }
    .wl-article a:hover { text-decoration:underline; }
    .wl-article img { max-width:100%; height:auto; }
    .wl-article table.infobox { float:inline-end; clear:inline-end; max-width:280px; margin:0 0 1em 1em;
      border:1px solid #a2a9b1; background:#f8f9fa; font-size:12px; border-collapse:collapse; }
    .wl-article .infobox td, .wl-article .infobox th { border:1px solid #eaecf0; padding:4px 6px; vertical-align:top; }
    .wl-article table.wikitable { border-collapse:collapse; margin:1em 0; font-size:13px; }
    .wl-article table.wikitable th, .wl-article table.wikitable td { border:1px solid #a2a9b1; padding:4px 8px; }
    .wl-article .thumb { margin:.5em 0; max-width:100%; }
    .wl-article .thumbcaption, .wl-article figcaption { font-size:12px; color:#54595d; }
    .wl-article ul, .wl-article ol { margin:.4em 0; padding-inline-start:1.5em; }
    .wl-article blockquote { border-inline-start:3px solid #c8ccd1; margin:.6em 0; padding-inline-start:12px; color:#54595d; }

    .wl-col.narrow .wl-article { padding:10px 12px 40px; font-size:13px; }
    .wl-col.narrow .wl-article table.infobox { float:none; max-width:none; width:auto; margin:.6em 0; }
    .wl-col.narrow .wl-article .thumb,
    .wl-col.narrow .wl-article .tright,
    .wl-col.narrow .wl-article .tleft { float:none !important; width:auto !important; max-width:100%; margin:.5em 0; }

    .wl-resize { position:absolute; left:0; top:0; bottom:0; width:8px; cursor:col-resize;
      background:transparent; z-index:5; }
    .wl-resize:hover { background:rgba(96,165,250,.5); }
  `;

  function ensureSplitStyle() {
    if (document.getElementById("wikilens-split-style")) return;
    const s = document.createElement("style");
    s.id = "wikilens-split-style";
    s.textContent = `
      html.${SPLIT_CLASS} body { margin-right: var(--wl-w, 50vw) !important; }
      #${PANE_ID} { position: fixed; top: 0; right: 0; width: var(--wl-w, 50vw);
        height: 100vh; z-index: 2147483647; box-shadow: -2px 0 14px rgba(0,0,0,.35); }
      @media (max-width: 720px) {
        html.${SPLIT_CLASS} body { margin-right: 0 !important; }
        #${PANE_ID} { width: 100vw; }
      }
    `;
    document.documentElement.appendChild(s);
  }

  // Auto-divide the page into equal parts: original + N columns each 1/(N+1).
  function balanceWidth() {
    const n = order.length;
    const vw = n <= 0 ? 50 : (n / (n + 1)) * 100;
    document.documentElement.style.setProperty("--wl-w", vw.toFixed(2) + "vw");
  }

  /* ----------------------------- shell ------------------------------- */

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
  const el = (id) => shadow && shadow.getElementById(id);

  function buildShell() {
    if (host) return;
    ensureSplitStyle();
    host = mk("div", { id: PANE_ID });
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANE_CSS;

    const root = mk("div", { class: "wl-root" }, [
      mk("header", { class: "wl-head" }, [
        mk("div", { class: "wl-brand", text: "WikiLens" }),
        mk("button", { id: "wl-add", class: "wl-add", title: "Add a language column", text: "+ language" }),
        mk("button", { id: "wl-close", class: "wl-close", title: "Close", text: "✕" }),
      ]),
      mk("div", { id: "wl-pickerbar", class: "wl-pickerbar", style: "display:none" }, [
        mk("select", { id: "wl-picker", class: "wl-picker" }),
      ]),
      mk("div", { id: "wl-status", class: "wl-status" }),
      mk("div", { id: "wl-articles", class: "wl-articles" }, [
        mk("div", { id: "wl-resize", class: "wl-resize", title: "Drag to resize" }),
      ]),
    ]);
    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    el("wl-close").addEventListener("click", () => toggle(false));
    el("wl-add").addEventListener("click", () => togglePicker());
    el("wl-picker").addEventListener("change", (e) => {
      const lang = e.target.value;
      el("wl-pickerbar").style.display = "none";
      if (lang) chooseLanguage(lang);
    });
    initResize(el("wl-resize"));

    ro = new ResizeObserver((entries) => {
      entries.forEach((en) => en.target.classList.toggle("narrow", en.contentRect.width < NARROW_PX));
    });
  }

  /* --------------------------- persistence --------------------------- */

  // Persist the two pieces SEPARATELY. Opening the pane must never write
  // wlLangs — on a fresh page `desired` is still [] until initLanguages() loads
  // it, so a combined save would wipe the saved selection before reading it.
  function saveActive() {
    browser.storage.local.set({ wlActive: isOpen });
  }
  function saveLangs() {
    browser.storage.local.set({ wlLangs: desired.slice() });
  }

  /* ----------------------------- open/close -------------------------- */

  async function toggle(force) {
    isOpen = typeof force === "boolean" ? force : !isOpen;
    if (isOpen) {
      buildShell();
      document.documentElement.classList.add(SPLIT_CLASS);
      host.style.display = "block";
      balanceWidth();
      saveActive();
      await initLanguages();
    } else if (host) {
      host.style.display = "none";
      document.documentElement.classList.remove(SPLIT_CLASS);
      saveActive();
    }
    return isOpen;
  }

  function setStatus(text, isErr) {
    const s = el("wl-status");
    if (!s) return;
    s.textContent = text || "";
    s.className = "wl-status" + (isErr ? " err" : "");
    s.style.display = text ? "block" : "none";
  }

  async function initLanguages() {
    current = WL.wiki.getCurrentArticle();
    const { wlLangs } = await browser.storage.local.get("wlLangs");
    desired = Array.isArray(wlLangs) ? wlLangs.slice() : [];

    if (!langlinks) {
      setStatus("finding other language editions…");
      try {
        langlinks = await WL.wiki.fetchLangLinks(current.lang, current.title);
      } catch (e) {
        setStatus("could not load language list: " + e.message, true);
        return;
      }
      langlinks.sort((a, b) => a.langname.localeCompare(b.langname));
    }
    setStatus("");
    if (!langlinks.length) {
      setStatus("This article has no parallel editions in other languages.");
      return;
    }
    populatePicker();
    // restore the chosen comparison languages for THIS article
    desired.forEach((lang) => {
      if (!panes.has(lang) && langlinks.some((l) => l.lang === lang)) openColumn(lang);
    });
    if (!order.length) togglePicker(true);
  }

  function populatePicker() {
    const sel = el("wl-picker");
    if (!sel) return;
    const opts = [{ value: "", label: "add a language…" }].concat(
      langlinks
        .filter((l) => !panes.has(l.lang))
        .map((l) => ({ value: l.lang, label: `${l.langname} — ${l.autonym}` }))
    );
    sel.replaceChildren();
    opts.forEach((o) => {
      const op = document.createElement("option");
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
  }

  function togglePicker(force) {
    const bar = el("wl-pickerbar");
    const show = force === true ? true : bar.style.display === "none";
    if (show) populatePicker();
    bar.style.display = show ? "block" : "none";
  }

  /* ----------------------------- columns ----------------------------- */

  // User picked a language from the "+" menu → add it to the comparison set.
  function chooseLanguage(lang) {
    if (!desired.includes(lang)) desired.push(lang);
    saveLangs();
    openColumn(lang);
  }

  // Open a column for `lang` on the current article (no-op if missing/already open).
  function openColumn(lang) {
    if (panes.has(lang)) return;
    const target = langlinks.find((l) => l.lang === lang);
    if (!target) return;

    const langSel = mk("select", { class: "wl-collang", title: "Switch this column's language" });
    const status = mk("span", { class: "wl-colstatus" });
    const body = mk("article", { class: "wl-article", dir: "auto" });
    const close = mk("span", { class: "wl-colclose", title: "Close", text: "✕" });
    const col = mk("div", { class: "wl-col" }, [
      mk("div", { class: "wl-colhead" }, [langSel, status, close]),
      body,
    ]);
    el("wl-articles").appendChild(col);
    if (ro) ro.observe(col);

    const pane = { lang, title: target.title, autonym: target.autonym, col, body, status, langSel, loading: true };
    panes.set(lang, pane);
    order.push(lang);

    fillColLangSelect(pane);
    langSel.addEventListener("change", (e) => switchColumnLang(pane, e.target.value));
    close.addEventListener("click", () => closeColumn(pane.lang));
    refreshColLangSelects(); // other columns' available sets changed
    populatePicker();
    balanceWidth();

    loadPane(pane).catch((e) => setColStatus(pane, "error: " + e.message, true));
  }

  // The per-column language dropdown lists every parallel edition except those
  // already open in OTHER columns (its own current language stays selectable).
  function fillColLangSelect(pane) {
    const sel = pane.langSel;
    const openElsewhere = new Set([...panes.keys()].filter((l) => l !== pane.lang));
    sel.replaceChildren();
    langlinks
      .filter((l) => l.lang === pane.lang || !openElsewhere.has(l.lang))
      .forEach((l) => {
        const op = document.createElement("option");
        op.value = l.lang;
        op.textContent = l.autonym;
        if (l.lang === pane.lang) op.selected = true;
        sel.appendChild(op);
      });
  }

  function refreshColLangSelects() {
    panes.forEach((p) => fillColLangSelect(p));
  }

  // Change an existing column's language in place — re-key it, update the chosen
  // set (so navigation carries the new language), and reload the article.
  function switchColumnLang(pane, newLang) {
    if (!newLang || newLang === pane.lang) return;
    const target = langlinks.find((l) => l.lang === newLang);
    if (!target || panes.has(newLang)) {
      fillColLangSelect(pane); // revert the dropdown
      return;
    }
    const di = desired.indexOf(pane.lang);
    if (di >= 0) desired[di] = newLang;
    else desired.push(newLang);

    panes.delete(pane.lang);
    const oi = order.indexOf(pane.lang);
    if (oi >= 0) order[oi] = newLang;
    pane.lang = newLang;
    pane.title = target.title;
    pane.autonym = target.autonym;
    panes.set(newLang, pane);

    saveLangs();
    refreshColLangSelects();
    populatePicker();
    loadPane(pane).catch((e) => setColStatus(pane, "error: " + e.message, true));
  }

  function closeColumn(lang) {
    const p = panes.get(lang);
    if (p) {
      if (ro) ro.unobserve(p.col);
      p.col.remove();
      panes.delete(lang);
      const i = order.indexOf(lang);
      if (i >= 0) order.splice(i, 1);
    }
    desired = desired.filter((l) => l !== lang); // explicit close removes from the set
    saveLangs();
    refreshColLangSelects(); // the freed language is now available to other columns
    populatePicker();
    balanceWidth();
    if (!order.length) togglePicker(true);
  }

  function setColStatus(pane, text, isErr) {
    pane.status.textContent = text || "";
    pane.status.className = "wl-colstatus" + (isErr ? " err" : "");
  }

  /* --------------------------- load + translate ---------------------- */

  async function readingLang() {
    const { readingLang } = await browser.storage.local.get("readingLang");
    if (readingLang && readingLang !== "auto") return readingLang;
    return current.lang;
  }

  async function loadPane(pane) {
    setColStatus(pane, "fetching…");
    const art = await WL.wiki.fetchArticleHtml(pane.lang, pane.title);
    const node = WL.wiki.buildArticleNode(art.html, pane.lang);

    pane.body.replaceChildren();
    pane.body.appendChild(mk("h1", { class: "wl-arttitle", dir: "auto", text: art.displayTitle }));
    pane.body.appendChild(node);

    const dst = await readingLang();
    pane.body.dir = WL.rtl.isRTL(dst) ? "rtl" : "ltr";

    let via = "original";
    if (pane.lang !== dst) via = await translatePane(pane, art, dst);

    pane.loading = false;
    setColStatus(pane, `rev ${art.revid} · ${via}`);
  }

  async function translatePane(pane, art, dst) {
    const tasks = collectTasks(pane.body);
    const groups = new Map();
    const ordered = [];
    tasks.forEach((t) => {
      if (!groups.has(t.text)) {
        groups.set(t.text, []);
        ordered.push(t.text);
      }
      groups.get(t.text).push(t);
    });

    const meta = { targetLang: pane.lang, title: pane.title, revid: art.revid, readingLang: dst };
    let map = new Map();
    try {
      const r = await bg({ type: "cache-get", meta });
      if (r && r.value && r.value.pairs) map = new Map(r.value.pairs);
    } catch {}

    ordered.forEach((text) => {
      if (map.has(text)) applyGroup(groups.get(text), map.get(text));
    });

    const missing = ordered.filter((t) => !map.has(t));
    if (!missing.length) return "cached";

    const res = await streamTranslate(missing, pane.lang, dst, pane, (i, tr) => {
      map.set(missing[i], tr);
      applyGroup(groups.get(missing[i]), tr); // progressive paint
    });
    bg({ type: "cache-put", meta, value: { pairs: [...map] } }).catch(() => {});
    return res.via;
  }

  async function streamTranslate(texts, src, dst, pane, onResult) {
    const { provider } = await browser.storage.local.get("provider");
    const mode = provider || "auto";
    const prog = (d, t) => setColStatus(pane, `translating ${d}/${t}…`);

    if (mode !== "google" && WL.providers.builtinAvailable()) {
      const status = await WL.providers.builtinStatus(src, dst);
      if (status !== "unavailable") {
        if (status !== "available") setColStatus(pane, "preparing translator…");
        await WL.providers.translateBuiltinTexts(
          texts, src, dst, prog,
          (l, t) => setColStatus(pane, `downloading translator ${Math.round((l / (t || 1)) * 100)}%…`),
          onResult
        );
        return { via: "on-device" };
      }
      if (mode === "builtin") throw new Error(`on-device translator can't do ${src}→${dst}`);
    } else if (mode === "builtin") {
      throw new Error("on-device translator not available in this browser");
    }

    const CH = 8;
    let done = 0;
    for (let i = 0; i < texts.length; i += CH) {
      const chunk = texts.slice(i, i + CH);
      const r = await bg({ type: "translate-google-texts", texts: chunk, src, dst });
      if (r && r.error) throw new Error(r.error);
      r.texts.forEach((tr, j) => onResult(i + j, tr));
      done += chunk.length;
      prog(done, texts.length);
    }
    return { via: "google" };
  }

  /* ----------------------- in-place text extraction ------------------ */

  function norm(s) {
    return (s || "").replace(/ /g, " ").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  }
  function hasLetters(s) {
    return /\p{L}/u.test(s);
  }
  function walkTextNodes(elm) {
    const out = [];
    const w = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function collectTasks(container) {
    const tasks = [];
    const leaves = [...container.querySelectorAll(BLOCK_SEL)].filter((e) => !e.querySelector(BLOCK_SEL));
    leaves.forEach((leaf) => {
      const media = leaf.querySelector(
        "img,audio,video,math,.mwe-math-element,.mwe-math-fallback-image-inline"
      );
      if (!media) {
        const text = norm(leaf.textContent);
        if (hasLetters(text)) tasks.push({ kind: "block", el: leaf, text });
      } else {
        walkTextNodes(leaf).forEach((node) => {
          const raw = node.nodeValue;
          const text = norm(raw);
          if (hasLetters(text)) {
            tasks.push({
              kind: "node",
              node,
              text,
              lead: (raw.match(/^\s*/) || [""])[0],
              trail: (raw.match(/\s*$/) || [""])[0],
            });
          }
        });
      }
    });
    return tasks;
  }
  function applyGroup(group, tr) {
    if (tr == null) return;
    group.forEach((t) => {
      if (t.kind === "block") t.el.textContent = tr;
      else t.node.nodeValue = t.lead + tr + t.trail;
    });
  }

  /* ----------------------------- resize ------------------------------ */

  function initResize(handle) {
    let overlay = null;
    function onMove(e) {
      const w = Math.min(Math.max(window.innerWidth - e.clientX, 320), window.innerWidth * 0.92);
      document.documentElement.style.setProperty("--wl-w", w + "px");
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (overlay) overlay.remove();
    }
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      overlay = mk("div", {
        style: "position:fixed;inset:0;z-index:2147483646;cursor:col-resize;background:transparent",
      });
      document.documentElement.appendChild(overlay);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  /* ----------------------------- messages ---------------------------- */

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
      return true;
    }
  });

  // Follow the user across navigation: if WikiLens was open, re-open it on the
  // next article automatically (Wikipedia browsing is article-to-article).
  (async function autoOpen() {
    if (!WL || !WL.wiki || !WL.wiki.isArticlePage()) return;
    const { wlActive } = await browser.storage.local.get("wlActive");
    if (wlActive) toggle(true);
  })();
})();
