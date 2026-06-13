/**
 * Minimal cross-browser shim. Firefox exposes promise-based `browser.*`
 * natively; Chrome MV3 (138+) returns promises on `chrome.*` for the APIs we
 * use (storage.local, tabs, runtime), so aliasing is enough — no full polyfill,
 * no dependency, consistent with the vanilla-JS house style.
 */
(function () {
  if (
    typeof globalThis.browser === "undefined" &&
    typeof globalThis.chrome !== "undefined"
  ) {
    globalThis.browser = globalThis.chrome;
  }
})();
