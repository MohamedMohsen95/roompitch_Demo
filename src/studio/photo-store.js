// Room photos are too big for localStorage, so they live in IndexedDB. Every call resolves, even on errors.
const DB = "roompitch", STORE = "photos", KEY = "current";

function open(){
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("no IndexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhotos(photos){
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(photos.map(p => ({id:p.id, dataUrl:p.dataUrl, wall:p.wall})), KEY);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* private window or storage blocked: photos last for this visit only */ }
}

export async function loadPhotos(){
  try {
    const db = await open();
    const list = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    db.close();
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
