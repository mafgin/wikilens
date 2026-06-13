/**
 * Popup: detect whether the active tab is a Wikipedia article (by pinging the
 * content script), then offer a "Compare editions" button that toggles the
 * split view in the page. All real work happens in the content script.
 */
const $title = document.getElementById("art-title");
const $sub = document.getElementById("art-sub");
const $btn = document.getElementById("compare-btn");
const $status = document.getElementById("status");
const $options = document.getElementById("options-link");

let tabId = null;

function setStatus(text) {
  $status.textContent = text || "";
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;

  let res = null;
  try {
    res = await browser.tabs.sendMessage(tabId, { type: "ping" });
  } catch (e) {
    // content script not present (non-Wikipedia tab, or page opened before the
    // extension was installed)
  }

  if (res && res.article && res.article.title) {
    $title.textContent = res.article.title;
    $sub.textContent = `${res.article.lang}.wikipedia.org`;
    $btn.disabled = false;
  } else if (res) {
    $title.textContent = "Not an article";
    $sub.textContent = "Open a Wikipedia article page, then try again.";
  } else {
    $title.textContent = "—";
    $sub.textContent =
      "Open a Wikipedia article. If it was already open, reload the tab.";
  }
}

$btn.addEventListener("click", async () => {
  try {
    await browser.tabs.sendMessage(tabId, { type: "toggle" });
    window.close();
  } catch (e) {
    setStatus("Reload the Wikipedia tab and try again.");
  }
});

$options.addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

init();
