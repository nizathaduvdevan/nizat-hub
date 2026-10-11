/* CACHE_VERSION משפיע רק על שם ה-Cache Storage ועל ניקוי גרסאות ישנות ממנו
   (ב-'activate' למטה) — מומלץ להעלות אותו (v4, v5...) בכל פעם שאתה עורך את
   הקובץ הזה עצמו, כדי שגם באנר "קיימת גרסה חדשה" יופיע. לא חובה יותר לבמת
   כל עדכון קוד רגיל (dashboard.js/main.css וכו') — אלה עכשיו Network-first
   ומתעדכנים אוטומטית בלי קשר לגרסה כאן (ראו ה-'fetch' listener למטה). */
const CACHE_VERSION = 'nizat-hub-static-v5';
const BASE = '/nizat-hub/';
const OFFLINE_URL = BASE + 'offline.html';
const STATIC_ASSETS = [
  OFFLINE_URL,
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/icon-maskable-192.png',
  BASE + 'icons/icon-maskable-512.png',
  BASE + 'images/nizat-logo.png'
];

/* Firebase Cloud Messaging — טיפול בהתראות Push שמגיעות כשהאפליקציה סגורה
   לגמרי או ברקע. חייב להיות באותו קובץ service worker שנרשם ב-scope הראשי,
   כדי שאותו רישום (registration) ישמש גם ל-messaging.getToken() בצד הלקוח. */
/* לחיצה על התראה — חייב להירשם *לפני* firebase.messaging(), כדי לרוץ לפני
   ה-handler הפנימי של Firebase (שפותח את fcmOptions.link — "/", כתובת שלא
   קיימת כאן, כי האפליקציה יושבת תחת /nizat-hub/). מטפל בשני סוגי ההתראות:
   - עדכוני מערכת (appUpdates): הקישור שמור ב-notification.data.link.
   - שידורים רגילים (broadcasts): Firebase שומר את ה-payload תחת data.FCM_MSG.
   הקישור הוא "#go=<מחלקה>:<מסך>&u=<id>". אם האפליקציה כבר פתוחה — מביאים
   אותה לחזית ושולחים לה את הקישור (ניווט בלי טעינה מחדש); אחרת פותחים אותה
   ישר על הקישור, ו-app-updates.js מנווט למסך אחרי הכניסה. */
self.addEventListener('notificationclick', function(event){
  const n = event.notification;
  const d = n.data || {};
  let link = d.link || '';
  if(!link && d.FCM_MSG && d.FCM_MSG.data && d.FCM_MSG.data.link) link = d.FCM_MSG.data.link;
  event.stopImmediatePropagation();
  n.close();
  event.waitUntil(openAppAt(link));
});
function openAppAt(link){
  const appRoot = self.location.origin + BASE;
  return self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    const client = list.find(function(c){ return c.url.indexOf(appRoot) === 0; });
    if(client){
      return client.focus().then(function(c){
        if(link) (c || client).postMessage({type:'NIZAT_OPEN_LINK', link: link});
      });
    }
    return self.clients.openWindow(appRoot + (link || ''));
  });
}

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

/* הודעה כשהאפליקציה סגורה/ברקע.
   - שידורים רגילים (broadcasts) מגיעים עם notification — Firebase מציג אותם
     בעצמו (ראו onPush ב-SDK), ולכן כאן לא מציגים שוב. קודם הצגנו גם כאן,
     וזה גרם להתראה כפולה.
   - עדכוני מערכת (appUpdates) מגיעים כ-data בלבד, עם link — כאן מציגים
     אותם ושומרים את הקישור, כדי שלחיצה תפתח את המסך שעודכן. */
messaging.onBackgroundMessage(function(payload){
  console.log('🔔 [NIZAT-DEBUG-SW] onBackgroundMessage הופעל בפועל! payload:', payload);
  if(payload.notification) return;
  const d = payload.data || {};
  const title = d.title || 'NIZAT HUB';
  const options = {
    body: d.body || '',
    icon: BASE + 'icons/notif-icon-192.png',
    badge: BASE + 'icons/notif-badge-96.png',
    dir: 'rtl',
    data: { link: d.link || '' }
  };
  return self.registration.showNotification(title, options).then(function(){
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

  /* קבצי הקוד/העיצוב של האפליקציה עצמה (כל .js/.css — dashboard.js, main.css,
     וכל מודול אחר, כולל כאלה שייווספו בעתיד) הם תמיד Network-first: כל עוד
     יש רשת, המכשיר תמיד מביא את הגרסה העדכנית ביותר ישירות מהשרת, בלי תלות
     בקאש-HTTP הרגיל של הדפדפן ובלי לחכות לבאנר "עדכון גרסה". רק אם אין
     בכלל רשת (מצב אופליין אמיתי) חוזרים לעותק האחרון שנשמר בקאש כגיבוי.
     זה הפתרון לכך שעדכון קוד (בלי לגעת ב-service-worker.js עצמו) לא הגיע
     אוטומטית למכשירים שה-PWA כבר מותקן אצלם. */
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Only explicitly-listed, versioned static PWA assets (icons/logo/offline
  // page — נדירי-שינוי) are cache-first.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
