/**
 * Right-to-left language detection for side-by-side rendering.
 * Covers the scripts most relevant to Mor's use (Hebrew, Arabic, Farsi, Urdu)
 * plus the common RTL Wikipedia language codes.
 */
(function () {
  const WL = (globalThis.WL = globalThis.WL || {});
  const RTL = new Set([
    "he", "ar", "fa", "ur", "yi", "dv", "ps", "sd", "ckb", "arc",
    "arz", "azb", "ckb", "ku", "nqo", "prs", "ug",
  ]);
  WL.rtl = {
    isRTL(lang) {
      if (!lang) return false;
      return RTL.has(String(lang).toLowerCase().split("-")[0]);
    },
  };
})();
