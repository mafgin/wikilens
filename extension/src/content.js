/**
 * WikiLens content script — runs on *.wikipedia.org/wiki/*.
 *
 * Splits the window in two. The live Wikipedia article narrows to the left; a
 * resizable right pane shows the SAME article from other language editions —
 * rendered with Wikipedia's own structure (headings, images, infobox, tables,
 * links, light styling) and translated IN PLACE so it still looks like
 * Wikipedia, just in your language.
 *
 *   • Tabs + "+"  — open several language editions at once, switch between them.
 *   • Drag handle — grow/shrink each half.
 *   • In-place translation — full-sentence quality, images/layout preserved,
 *     including the article title.
 */
(function () {
  const WL = globalThis.WL;
  const bg = (msg) => browser.runtime.sendMessage(msg);

  const SPLIT_CLASS = "wikilens-split-active";
  const PANE_ID = "wikilens-pane";
  const BLOCK_SEL =
    "p,li,h1,h2,h3,h4,h5,caption,th,td,dt,dd,blockquote,figcaption,.thumbcaption,.gallerytext";

  let host = null;
  let shadow = null;
  let isOpen = false;
  let current = null; // { lang, title } of the article we're reading
  let langlinks = null; // interlanguage links for this article
  const panes = new Map(); // lang -> pane state
  const order = []; // tab order (langs)
  let activeLang = null;

  /* ----------------------------- styling ----------------------------- */

  const PANE_CSS = `
    .wl-root { display:flex; flex-direction:column; height:100vh; background:#0A0E1A;
      color:#F8FAFC; font-family:-apple-system, system-ui, 'Segoe UI', sans-serif;
      font-size:14px; box-sizing:border-box; }
    .wl-head { display:flex; align-items:center; gap:8px; padding:8px 10px 0;
      background:#0F1420; }
    .wl-brand { font-size:11px; font-weight:700; letter-spacing:.5px;
      text-transform:uppercase; color:#60A5FA; white-space:nowrap; padding-bottom:8px; }
    .wl-tabs { display:flex; align-items:flex-end; gap:3px; flex:1; min-width:0;
      overflow-x:auto; }
    .wl-tab { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,.07);
      color:#cbd5e1; border:none; border-radius:6px 6px 0 0; padding:6px 9px;
      font-size:12px; cursor:pointer; white-space:nowrap; }
    .wl-tab.active { background:#fff; color:#111; }
    .wl-tab .wl-x { opacity:.45; font-weight:700; }
    .wl-tab .wl-x:hover { opacity:1; }
    .wl-add { background:#60A5FA; color:#0A0E1A; border:none; border-radius:6px;
      width:26px; height:26px; font-size:17px; line-height:1; cursor:pointer;
      flex:none; margin-bottom:6px; }
    .wl-close { background:rgba(255,255,255,.08); color:#F8FAFC; border:none;
      border-radius:6px; width:26px; height:26px; cursor:pointer; flex:none;
      margin-bottom:6px; }
    .wl-close:hover { background:rgba(255,255,255,.16); }
    .wl-pickerbar { padding:6px 10px; background:#0F1420; }
    .wl-picker { width:100%; background:#0A0E1A; color:#fff;
      border:1px solid rgba(255,255,255,.15); border-radius:6px; padding:6px 8px;
      font-size:13px; }
    .wl-prov { padding:5px 10px; font-size:11px; color:rgba(255,255,255,.5);
      background:#0F1420; font-family:ui-monospace, SFMono-Regular, monospace; }
    .wl-prov:empty { display:none; }
    .wl-status { padding:6px 10px; font-size:12px; color:#60A5FA; background:#0F1420;
      display:none; }
    .wl-status.err { color:#EF4444; }
    .wl-articles { flex:1; overflow:auto; background:#fff; position:relative; }

    /* the translated article — keep Wikipedia's look */
    .wl-article { display:none; padding:16px 22px 60px; color:#202122; background:#fff;
      font-family:-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height:1.65; }
    .wl-article.active { display:block; }
    .wl-article .wl-arttitle { font-family:Georgia,'Linux Libertine',serif; font-size:26px;
      font-weight:normal; margin:0 0 .4em; padding-bottom:.2em;
      border-bottom:1px solid #a2a9b1; color:#000; }
    .wl-article h2 { font-family:Georgia,serif; font-size:20px; font-weight:normal;
      border-bottom:1px solid #a2a9b1; padding-bottom:.2em; margin:1em 0 .4em; }
    .wl-article h3 { font-size:16px; margin:.9em 0 .3em; }
    .wl-article h4 { font-size:14px; margin:.7em 0 .3em; }
    .wl-article p { margin:.5em 0; }
    .wl-article a { color:#3366cc; text-decoration:none; }
    .wl-article a:hover { text-decoration:underline; }
    .wl-article img { max-width:100%; height:auto; }
    .wl-article table.infobox { float:inline-end; clear:inline-end; max-width:300px;
      margin:0 0 1em 1em; border:1px solid #a2a9b1; background:#f8f9fa; font-size:12px;
      border-collapse:collapse; }
    .wl-article .infobox td, .wl-article .infobox th { border:1px solid #eaecf0;
      padding:4px 6px; vertical-align:top; }
    .wl-article table.wikitable { border-collapse:collapse; margin:1em 0; font-size:13px; }
    .wl-article table.wikitable th, .wl-article table.wikitable td {
      border:1px solid #a2a9b1; padding:4px 8px; }
    .wl-article .thumb { margin:.5em 0; max-width:100%; }
    .wl-article .thumbcaption, .wl-article figcaption { font-size:12px; color:#54595d; }
    .wl-article ul, .wl-article ol { margin:.4em 0; padding-inline-start:1.6em; }
    .wl-article blockquote { border-inline-start:3px solid #c8ccd1; margin:.6em 0;
      padding-inline-start:12px; color:#54595d; }

    .wl-resize { position:absolute; left:0; top:0; bottom:0; width:7px;
      cursor:col-resize; background:transparent; }
    .wl-resize:hover { background:rgba(96,165,250,.4); }
  `;

  function ensureSplitStyle() {
    if (document.getElementById("wikilens-split-style")) return;
    const s = document.createElement("style");
    s.id = "wikilens-split-style";
    // Width is a CSS var so the drag handle can resize both halves at once.
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
        mk("div", { id: "wl-tabs", class: "wl-tabs" }),
        mk("button", { id: "wl-add", class: "wl-add", title: "Add a language", text: "+" }),
        mk("button", { id: "wl-close", class: "wl-close", title: "Close", text: "✕" }),
      ]),
      mk("div", { id: "wl-pickerbar", class: "wl-pickerbar", style: "display:none" }, [
        mk("select", { id: "wl-picker", class: "wl-picker" }),
      ]),
      mk("div", { id: "wl-prov", class: "wl-prov" }),
      mk("div", { id: "wl-status", class: "wl-status" }),
      mk("div", { id: "wl-articles", class: "wl-articles" }, [
        mk("div", { id: "wl-resize", class: "wl-resize", title: "Drag to resize" }),
      ]),
    ]);

    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    el("wl-close").addEventListener("click", () => toggle(false));
    el("wl-add").addEventListener("click", togglePicker);
    el("wl-picker").addEventListener("change", (e) => {
      const lang = e.target.value;
      el("wl-pickerbar").style.display = "none";
      if (lang) addPane(lang);
    });
    initResize(el("wl-resize"));
  }

  /* ----------------------------- open/close -------------------------- */

  async function toggle(force) {
    isOpen = typeof force === "boolean" ? force : !isOpen;
    if (isOpen) {
      buildShell();
      const { splitWidth } = await browser.storage.local.get("splitWidth");
      document.documentElement.style.setProperty("--wl-w", splitWidth || "50vw");
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
    if (langlinks) {
      populatePicker();
      return;
    }
    current = WL.wiki.getCurrentArticle();
    setStatus("finding other language editions…");
    try {
      langlinks = await WL.wiki.fetchLangLinks(current.lang, current.title);
    } catch (e) {
      setStatus("could not load language list: " + e.message, true);
      return;
    }
    langlinks.sort((a, b) => a.langname.localeCompare(b.langname));
    setStatus("");
    if (!langlinks.length) {
      setStatus("This article has no parallel editions in other languages.");
      return;
    }
    populatePicker();
    // auto-open the last language used, if it exists here
    const { lastTargetLang } = await browser.storage.local.get("lastTargetLang");
    if (lastTargetLang && langlinks.some((l) => l.lang === lastTargetLang)) {
      addPane(lastTargetLang);
    } else {
      togglePicker(true); // nudge: show the picker so the user can choose
    }
  }

  function populatePicker() {
    const sel = el("wl-picker");
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

  /* ----------------------------- tabs/panes -------------------------- */

  function refreshTabs() {
    const tabs = el("wl-tabs");
    tabs.replaceChildren();
    order.forEach((lang) => {
      const p = panes.get(lang);
      const label = p.autonym + (p.loading ? " ◌" : "");
      const tab = mk("div", {
        class: "wl-tab" + (lang === activeLang ? " active" : ""),
      }, [mk("span", { text: label })]);
      tab.addEventListener("click", () => setActive(lang));
      const x = mk("span", { class: "wl-x", text: "✕", title: "Close" });
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        closePane(lang);
      });
      tab.appendChild(x);
      tabs.appendChild(tab);
    });
  }

  function addPane(lang) {
    if (panes.has(lang)) {
      setActive(lang);
      return;
    }
    const target = langlinks.find((l) => l.lang === lang);
    if (!target) return;
    browser.storage.local.set({ lastTargetLang: lang });
    const container = mk("article", { class: "wl-article", dir: "auto" });
    el("wl-articles").appendChild(container);
    const pane = {
      lang,
      title: target.title,
      autonym: target.autonym,
      container,
      loading: true,
      prov: "",
      status: "",
    };
    panes.set(lang, pane);
    order.push(lang);
    refreshTabs();
    setActive(lang);
    loadPane(pane).catch((e) => setPaneStatus(pane, "error: " + e.message, true));
  }

  function setActive(lang) {
    activeLang = lang;
    panes.forEach((p) => p.container.classList.toggle("active", p.lang === lang));
    const p = panes.get(lang);
    el("wl-prov").textContent = p ? p.prov : "";
    renderStatus(p);
    refreshTabs();
  }

  function closePane(lang) {
    const p = panes.get(lang);
    if (!p) return;
    p.container.remove();
    panes.delete(lang);
    const i = order.indexOf(lang);
    if (i >= 0) order.splice(i, 1);
    if (activeLang === lang) activeLang = order[order.length - 1] || null;
    if (activeLang) setActive(activeLang);
    else {
      el("wl-prov").textContent = "";
      setStatus("");
      refreshTabs();
      togglePicker(true);
    }
    populatePicker();
  }

  /* --------------------------- status helpers ------------------------ */

  function setStatus(text, isErr) {
    const s = el("wl-status");
    if (!s) return;
    s.textContent = text || "";
    s.className = "wl-status" + (isErr ? " err" : "");
    s.style.display = text ? "block" : "none";
  }
  function setPaneStatus(pane, text, isErr) {
    pane.status = text || "";
    pane.statusErr = !!isErr;
    if (pane.lang === activeLang) renderStatus(pane);
  }
  function renderStatus(pane) {
    setStatus(pane ? pane.status : "", pane && pane.statusErr);
  }

  /* --------------------------- load + translate ---------------------- */

  async function readingLang() {
    const { readingLang } = await browser.storage.local.get("readingLang");
    if (readingLang && readingLang !== "auto") return readingLang;
    return current.lang;
  }

  async function loadPane(pane) {
    setPaneStatus(pane, "fetching " + pane.autonym + " article…");
    const art = await WL.wiki.fetchArticleHtml(pane.lang, pane.title);
    const node = WL.wiki.buildArticleNode(art.html, pane.lang);

    pane.container.replaceChildren();
    pane.container.appendChild(mk("h1", { class: "wl-arttitle", dir: "auto", text: art.displayTitle }));
    pane.container.appendChild(node);

    const dst = await readingLang();
    pane.container.dir = WL.rtl.isRTL(dst) ? "rtl" : "ltr";

    let via = "original";
    if (pane.lang !== dst) {
      via = await translatePane(pane, art, dst);
    }

    pane.loading = false;
    pane.prov = `${pane.autonym} (${pane.lang}) → ${dst} · rev ${art.revid} · ${via}`;
    if (pane.lang === activeLang) el("wl-prov").textContent = pane.prov;
    setPaneStatus(pane, "");
    refreshTabs();
  }

  async function translatePane(pane, art, dst) {
    const tasks = collectTasks(pane.container);
    const unique = [...new Set(tasks.map((t) => t.text))];

    const meta = { targetLang: pane.lang, title: pane.title, revid: art.revid, readingLang: dst };
    let map = new Map();
    try {
      const r = await bg({ type: "cache-get", meta });
      if (r && r.value && r.value.pairs) map = new Map(r.value.pairs);
    } catch {}

    const missing = unique.filter((t) => !map.has(t));
    let via = "cached";
    if (missing.length) {
      const r = await translateTexts(missing, pane.lang, dst, pane);
      missing.forEach((t, i) => map.set(t, r.texts[i]));
      via = r.via;
      bg({ type: "cache-put", meta, value: { pairs: [...map] } }).catch(() => {});
    }
    applyTasks(tasks, map);
    return via;
  }

  async function translateTexts(texts, src, dst, pane) {
    const { provider } = await browser.storage.local.get("provider");
    const mode = provider || "auto";
    const prog = (d, t) => setPaneStatus(pane, `translating ${d}/${t}…`);

    if (mode !== "google" && WL.providers.builtinAvailable()) {
      const status = await WL.providers.builtinStatus(src, dst);
      if (status !== "unavailable") {
        if (status !== "available") setPaneStatus(pane, "preparing on-device translator…");
        const out = await WL.providers.translateBuiltinTexts(
          texts, src, dst, prog,
          (l, t) => setPaneStatus(pane, `downloading translator ${Math.round((l / (t || 1)) * 100)}%…`)
        );
        return { texts: out, via: "on-device" };
      }
      if (mode === "builtin") throw new Error(`on-device translator can't do ${src}→${dst}`);
    } else if (mode === "builtin") {
      throw new Error("on-device translator not available in this browser");
    }

    setPaneStatus(pane, "translating…");
    const r = await bg({ type: "translate-google-texts", texts, src, dst });
    if (r && r.error) throw new Error(r.error);
    return { texts: r.texts, via: "google" };
  }

  /* ----------------------- in-place text extraction ------------------ */

  function norm(s) {
    return (s || "").replace(/ /g, " ").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  }
  function hasLetters(s) {
    return /\p{L}/u.test(s);
  }
  function walkTextNodes(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }

  // Collect translation tasks. Text-only blocks translate whole (best quality);
  // blocks that hold media translate their text nodes individually so the
  // images/formulas survive.
  function collectTasks(container) {
    const tasks = [];
    const leaves = [...container.querySelectorAll(BLOCK_SEL)].filter(
      (e) => !e.querySelector(BLOCK_SEL)
    );
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

  function applyTasks(tasks, map) {
    tasks.forEach((t) => {
      const tr = map.get(t.text);
      if (tr == null) return;
      if (t.kind === "block") t.el.textContent = tr;
      else t.node.nodeValue = t.lead + tr + t.trail;
    });
  }

  /* ----------------------------- resize ------------------------------ */

  function initResize(handle) {
    let overlay = null;
    function onMove(e) {
      const w = Math.min(Math.max(window.innerWidth - e.clientX, 320), window.innerWidth * 0.85);
      document.documentElement.style.setProperty("--wl-w", w + "px");
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (overlay) overlay.remove();
      const w = getComputedStyle(document.documentElement).getPropertyValue("--wl-w").trim();
      if (w) browser.storage.local.set({ splitWidth: w });
    }
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      overlay = mk("div", {
        style:
          "position:fixed;inset:0;z-index:2147483646;cursor:col-resize;background:transparent",
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
})();
