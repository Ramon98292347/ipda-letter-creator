const CACHE_NAME = 'ipda-cartas-v3';
const OFFLINE_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  // Removido: self.skipWaiting() automático. Agora a interface decide quando atualizar!
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : undefined)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isSameOrigin && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (isSameOrigin) return caches.match('/index.html');
        throw new Error('network_error');
      })
  );
});

// --- Push Notifications ---

// Comentario: valida se usuario tem escopo para receber a notificacao (hierarquia)
async function validarEscopoNotificacao(data) {
  // Se nao informou scope, mostra a notificacao (compatibilidade com antigas)
  if (!data.churchClass || !data.scopeTotvsIds) {
    return true;
  }

  try {
    // Tenta recuperar usuario do storage para validar escopo
    const db = await openUserDB();
    const user = await getFromDB(db, 'user');

    if (!user) return true; // Se nao tiver user salvo, aceita notificacao

    const userRole = String(user.role || '').toLowerCase();
    const notifChurchClass = String(data.churchClass || '').toLowerCase();
    const notifScope = Array.isArray(data.scopeTotvsIds) ? data.scopeTotvsIds : [];

    // Comentario: admin ve todas as notificacoes
    if (userRole === 'admin') {
      return true;
    }

    // Comentario: pastor ve notificacoes de seu escopo (hierarquia)
    const userScope = Array.isArray(user.scope_totvs_ids) ? user.scope_totvs_ids : [];
    const temInteseccao = notifScope.some(id => userScope.includes(id));

    return temInteseccao;
  } catch (err) {
    console.warn('[push] erro ao validar escopo:', err);
    return true; // Se erro, aceita notificacao
  }
}

// Helpers para IndexedDB (armazenar escopo do usuario)
function openUserDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ipda-user-db', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('user')) {
        db.createObjectStore('user');
      }
    };
  });
}

function getFromDB(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('user', 'readonly');
    const store = tx.objectStore('user');
    const req = store.get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'SGE IPDA', body: event.data.text() };
  }

  // Comentario: valida escopo antes de mostrar notificacao
  event.waitUntil(
    validarEscopoNotificacao(data).then((podeExibir) => {
      if (!podeExibir) {
        console.log('[push] notificacao bloqueada (fora do escopo)');
        return;
      }

      const title = data.title || 'SGE IPDA';
      const options = {
        body: data.body || '',
        icon: '/app-icon.png',
        badge: '/app-icon.png',
        data: { url: data.url || '/' },
        vibrate: [200, 100, 200],
        requireInteraction: false,
      };

      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
