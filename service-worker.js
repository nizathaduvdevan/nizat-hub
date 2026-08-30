const CACHE_VERSION = 'nizat-hub-static-v1';
const BASE = '/nizat-hub/';
const OFFLINE_URL = BASE + 'offline.html';
const STATIC_ASSETS = [
  OFFLINE_URL,
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/icon-maskable-192.png',
  BASE + 'icons/icon-maskable-512.png'
];

/* Firebase Cloud Messaging — טיפול בהתראות Push שמגיעות כשהאפליקציה סגורה
   לגמרי או ברקע. חייב להיות באותו קובץ service worker שנרשם ב-scope הראשי,
   כדי שאותו רישום (registration) ישמש גם ל-messaging.getToken() בצד הלקוח. */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyB9xW53EN2e6IjwrI7r6KU5uZAHOHPpLtY",
  authDomain: "nizat-hub.firebaseapp.com",
  projectId: "nizat-hub",
  storageBucket: "nizat-hub.firebasestorage.app",
  messagingSenderId: "155707428898",
  appId: "1:155707428898:web:5d56d241b1523d340d7a7b"
});
const messaging = firebase.messaging();
console.log('🔔 [NIZAT-DEBUG-SW] messaging אותחל ב-Service Worker:', messaging);

/* בדיקת אבחון עצמאית לגמרי: listener גולמי לאירוע 'push' עצמו, בלי שום תלות
   בפיענוח הפנימי של Firebase. אם השורה הזו לא מופיעה בקונסולה הייעודית של
   ה-Service Worker (chrome://inspect/#service-workers) כשנשלח שידור — זה
   מוכיח בוודאות שההודעה בכלל לא מגיעה ל-Service Worker (בעיה לפני השכבה
   שלנו, למשל ברמת הדפדפן/הרשת/FCM). אם היא כן מופיעה — הבעיה היא בפיענוח
   או בתצוגה, לא בהגעה עצמה. */
self.addEventListener('push', function(event){
  console.log('🔔 [NIZAT-DEBUG-SW] אירוע push גולמי התקבל!', event.data ? event.data.text() : '(ללא data)');
});

messaging.onBackgroundMessage(function(payload){
  console.log('🔔 [NIZAT-DEBUG-SW] onBackgroundMessage הופעל בפועל! payload:', payload);
  const title = (payload.notification && payload.notification.title) || 'NIZAT HUB';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: BASE + 'icons/icon-192.png',
    badge: BASE + 'icons/icon-192.png',
    dir: 'rtl'
  };
  self.registration.showNotification(title, options).then(function(){
    console.log('🔔 [NIZAT-DEBUG-SW] showNotification הסתיים בהצלחה');
  }).catch(function(err){
    console.error('🔔 [NIZAT-DEBUG-SW] showNotification נכשל בשגיאה:', err);
  });
});

self.addEventListener('install', event => {
  // מכריח את הגרסה החדשה של ה-Service Worker להיכנס לתוקף מיידית, גם אם יש
  // עדיין לקוח פתוח (טאב/PWA) הנשלט על ידי הגרסה הישנה — כדי שתמיכה קריטית
  // (כמו טיפול בהתראות Push ברקע) לא תישאר "תקועה" עד שהמשתמש יסגור את
  // האפליקציה לגמרי או ילחץ ידנית על באנר "עדכון גרסה".
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('nizat-hub-') && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache cross-origin traffic, Firebase, Google Auth or APIs.
  if (url.origin !== self.location.origin) return;

  // Navigation is always network-first so managers receive the newest index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Only explicitly-listed, versioned static PWA assets are cached.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
