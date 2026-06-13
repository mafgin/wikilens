/**
 * Options: a reading-language default and an engine override. Stored in
 * browser.storage.local. No secrets, no tokens — there is no backend.
 */
const $reading = document.getElementById("reading-lang");
const $provider = document.getElementById("provider");
const $save = document.getElementById("save-btn");
const $status = document.getElementById("status");

async function load() {
  const { readingLang, provider } = await browser.storage.local.get([
    "readingLang",
    "provider",
  ]);
  if (readingLang) $reading.value = readingLang;
  if (provider) $provider.value = provider;
}

async function save() {
  await browser.storage.local.set({
    readingLang: $reading.value,
    provider: $provider.value,
  });
  $status.textContent = "saved";
  $status.className = "status ok";
  setTimeout(() => {
    $status.textContent = "";
    $status.className = "status";
  }, 1500);
}

$save.addEventListener("click", save);
load();
