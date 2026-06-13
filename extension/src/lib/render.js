/**
 * Render translated blocks into the right pane. Groups consecutive <li> blocks
 * into a single <ul>. `dir="auto"` per element handles RTL targets (Hebrew /
 * Arabic) without guessing.
 */
(function () {
  const WL = (globalThis.WL = globalThis.WL || {});
  const TAGMAP = { p: "p", h2: "h2", h3: "h3", h4: "h4", li: "li", blockquote: "blockquote" };

  function into(container, blocks) {
    let list = null;
    blocks.forEach((b) => {
      const tag = TAGMAP[b.tag] || "p";
      if (tag === "li") {
        if (!list) {
          list = document.createElement("ul");
          container.appendChild(list);
        }
        const li = document.createElement("li");
        li.textContent = b.text;
        li.dir = "auto";
        list.appendChild(li);
        return;
      }
      list = null;
      const el = document.createElement(tag);
      el.textContent = b.text;
      el.dir = "auto";
      container.appendChild(el);
    });
  }

  WL.render = { into };
})();
