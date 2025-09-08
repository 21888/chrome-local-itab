// Favicon cache with IndexedDB primary and Cache API fallback
// Public API:
//   faviconCache.getIconDataUrl(origin) -> Promise<string|null>
//   faviconCache.invalidate(origin) -> Promise<void>
//   faviconCache.prefetch(origin) -> Promise<void>

(function() {
	const DB_NAME = 'local_itab_icons';
	const DB_STORE = 'icons';
	const DB_VERSION = 1;
	const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

	function getOriginFromUrl(url) {
		try {
			const u = new URL(url.startsWith('http') ? url : 'https://' + url);
			return u.origin;
		} catch (_) {
			return null;
		}
	}

	function openDb() {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(DB_STORE)) {
					const store = db.createObjectStore(DB_STORE, { keyPath: 'origin' });
					store.createIndex('updatedAt', 'updatedAt', { unique: false });
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async function idbGet(origin) {
		try {
			const db = await openDb();
			return await new Promise((resolve, reject) => {
				const tx = db.transaction(DB_STORE, 'readonly');
				const store = tx.objectStore(DB_STORE);
				const req = store.get(origin);
				req.onsuccess = () => resolve(req.result || null);
				req.onerror = () => reject(req.error);
			});
		} catch (_) {
			return null;
		}
	}

	async function idbSet(record) {
		try {
			const db = await openDb();
			await new Promise((resolve, reject) => {
				const tx = db.transaction(DB_STORE, 'readwrite');
				const store = tx.objectStore(DB_STORE);
				store.put(record);
				tx.oncomplete = () => resolve(true);
				tx.onerror = () => reject(tx.error);
			});
			return true;
		} catch (_) {
			return false;
		}
	}

	async function idbDelete(origin) {
		try {
			const db = await openDb();
			await new Promise((resolve, reject) => {
				const tx = db.transaction(DB_STORE, 'readwrite');
				const store = tx.objectStore(DB_STORE);
				store.delete(origin);
				tx.oncomplete = () => resolve(true);
				tx.onerror = () => reject(tx.error);
			});
		} catch (_) {}
	}

	async function fetchAsDataUrl(url) {
		try {
			const resp = await fetch(url, { cache: 'no-cache', redirect: 'follow' });
			if (!resp.ok) return null;
			const blob = await resp.blob();
			return await new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result);
				reader.onerror = reject;
				reader.readAsDataURL(blob);
			});
		} catch (_) {
			return null;
		}
	}

	function buildFaviconUrls(origin) {
		try {
			const u = new URL(origin);
			return [
				`https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`,
				`${u.origin}/favicon.ico`
			];
		} catch (_) {
			return [];
		}
	}

	async function tryFetchFavicon(origin) {
		const candidates = buildFaviconUrls(origin);
		for (const url of candidates) {
			const dataUrl = await fetchAsDataUrl(url);
			if (dataUrl) return dataUrl;
		}
		return null;
	}

	async function getIconDataUrl(origin) {
		if (!origin) return null;
		// 1) IDB cache
		const rec = await idbGet(origin);
		const now = Date.now();
		if (rec && rec.dataUrl && (now - (rec.updatedAt || 0)) < MAX_AGE_MS) {
			return rec.dataUrl;
		}

		// 2) Try network, then store
		const dataUrl = await tryFetchFavicon(origin);
		if (dataUrl) {
			await idbSet({ origin, dataUrl, updatedAt: now });
			return dataUrl;
		}

		// 3) Fallback: Cache API with request (optional)
		try {
			const cache = await caches.open('local-itab-favicons');
			const urls = buildFaviconUrls(origin);
			for (const u of urls) {
				const match = await cache.match(u);
				if (match) {
					const blob = await match.blob();
					const du = await new Promise((resolve, reject) => {
						const r = new FileReader();
						r.onload = () => resolve(r.result);
						r.onerror = reject;
						r.readAsDataURL(blob);
					});

					await idbSet({ origin, dataUrl: du, updatedAt: now });
					return du;
				}
			}
		} catch (_) {}

		return null;
	}

	async function prefetch(origin) {
		const du = await tryFetchFavicon(origin);
		if (du) await idbSet({ origin, dataUrl: du, updatedAt: Date.now() });
	}

	async function invalidate(origin) {
		await idbDelete(origin);
	}

	window.faviconCache = { getIconDataUrl, prefetch, invalidate, getOriginFromUrl };
})();

