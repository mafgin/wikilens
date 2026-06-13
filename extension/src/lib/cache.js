/**
 * IndexedDB translation cache. Loaded in the BACKGROUND context so it lives on
 * the extension origin (unified across all *.wikipedia.org), not a per-wiki
 * page origin. Keyed on (targetLang, title, revid, readingLang) — an unchanged
 * revid means the translation is still valid, so re-reads are instant and free.
 * No TTL needed: revid is the invalidator.
 */
(function () {
  const WL = (globalThis.WL = globalThis.WL || {});
  const DB_NAME = "wikilens";
  const STORE = "translations";
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  const keyFor = (m) => `${m.targetLang}:${m.title}:${m.revid}:${m.readingLang}`;

  async function get(meta) {
    const db = await open();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(keyFor(meta));
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    });
  }

  async function put(meta, value) {
    const db = await open();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: keyFor(meta), value, savedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  WL.cache = { get, put };
})();
