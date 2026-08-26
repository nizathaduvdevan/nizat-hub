/**
 * NIZAT HUB — Cloud Functions for real push notifications (FCM).
 *
 * Two functions:
 *  1. standTakedownReminders — runs once a day, checks every stand campaign's
 *     takedown date, and sends a real push (works even if the app is fully
 *     closed) 5 days and 3 days before the date, to the relevant branches only.
 *  2. sendBroadcast — fires automatically whenever a document is created in
 *     the "broadcasts" collection (i.e. when Inbar uses the "שידור עדכון"
 *     screen in the app), and pushes that message to every device that has
 *     enabled notifications.
 *
 * Deploy with:  firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

/** "DD.MM.YYYY" -> epoch millis (local server time). */
function parseHebDate(dateStr) {
  if (!dateStr) return NaN;
  const parts = dateStr.split('.').map(Number);
  if (parts.length !== 3) return NaN;
  const [d, m, y] = parts;
  return new Date(y, m - 1, d).getTime();
}

/** Loads every registered push token, grouped by viewerId (e.g. "branch:foo@nizat.co.il"). */
async function getTokenMap() {
  const snap = await db.collection('pushTokens').get();
  const map = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (!d.viewerId || !d.token) return;
    if (!map[d.viewerId]) map[d.viewerId] = [];
    map[d.viewerId].push({ token: d.token, docId: doc.id });
  });
  return map;
}

/** Deletes pushTokens docs whose token FCM reports as permanently dead. */
async function cleanupDeadTokens(deadDocIds) {
  if (!deadDocIds.length) return;
  const batch = db.batch();
  deadDocIds.forEach((id) => batch.delete(db.collection('pushTokens').doc(id)));
  await batch.commit();
  console.log(`[cleanupDeadTokens] מחקתי ${deadDocIds.length} טוקנים לא תקפים לצמיתות:`, deadDocIds);
}

/**
 * Sends a push to a list of {token, docId} entries, batching in groups of 500
 * (FCM's per-call limit). Logs the EXACT error code/message per failed token
 * (not just a count), and auto-removes tokens FCM says are permanently dead
 * (unregistered / invalid) so they stop being retried forever.
 */
async function sendPush(entries, title, body) {
  const byToken = new Map();
  entries.forEach((e) => { if (e && e.token) byToken.set(e.token, e.docId); });
  const uniqueTokens = [...byToken.keys()];
  if (!uniqueTokens.length) return { successCount: 0, failureCount: 0 };

  let successCount = 0, failureCount = 0;
  const deadDocIds = [];

  for (let i = 0; i < uniqueTokens.length; i += 500) {
    const chunk = uniqueTokens.slice(i, i + 500);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        webpush: { fcmOptions: { link: '/' } }
      });
      successCount += res.successCount;
      failureCount += res.failureCount;

      // הלב של התיקון: מדפיסים בדיוק מה FCM אמר על כל טוקן שנכשל, ולא רק סופרים.
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const token = chunk[idx];
        const code = r.error && r.error.code;
        const message = r.error && r.error.message;
        console.error(`[sendPush] טוקן נכשל (${token.slice(0, 20)}...): ${code} — ${message}`);
        // קודי שגיאה שמעידים שהטוקן מת לצמיתות (לא בעיה זמנית) — מנקים אותם.
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument') {
          const docId = byToken.get(token);
          if (docId) deadDocIds.push(docId);
        }
      });
    } catch (err) {
      console.error('sendPush chunk failed (שגיאה כללית בקריאה ל-FCM, לא לכל טוקן ספציפי):', err);
    }
  }

  await cleanupDeadTokens(deadDocIds);
  return { successCount, failureCount };
}

exports.standTakedownReminders = functions
  .region('us-central1')
  .pubsub.schedule('every 24 hours')
  .timeZone('Asia/Jerusalem')
  .onRun(async () => {
    const tokenMap = await getTokenMap();
    const campsSnap = await db.collection('standCampaigns').get();
    const now = Date.now();
    const updates = [];

    for (const doc of campsSnap.docs) {
      const camp = doc.data();
      if (!camp.takedownDate) continue;
      const t = parseHebDate(camp.takedownDate);
      if (Number.isNaN(t)) continue;
      const daysLeft = (t - now) / 86400000;
      const branchEmails = (camp.branches || [])
        .map((b) => b.matchedBranchEmail)
        .filter(Boolean);
      if (!branchEmails.length) continue;
      const entries = branchEmails.flatMap((e) => tokenMap['branch:' + e] || []);

      if (!camp.reminder5Sent && daysLeft <= 5 && daysLeft > 3) {
        const { successCount } = await sendPush(
          entries,
          '🪧 תזכורת: יש להוריד סטנד בקרוב',
          `${camp.label} — יש להוריד את הסטנד בעוד כ-5 ימים (${camp.takedownDate}).`
        );
        console.log(`[standTakedownReminders] 5-day push for "${camp.label}": sent to ${successCount} devices`);
        updates.push(doc.ref.update({ reminder5Sent: true }));
      }

      if (!camp.reminder3Sent && daysLeft <= 3 && daysLeft >= -3) {
        const { successCount } = await sendPush(
          entries,
          '⏰ תזכורת דחופה: להוריד סטנד — נדרש אישור',
          `${camp.label} — יש להוריד את הסטנד עד ${camp.takedownDate}. יש לאשר קבלה באפליקציה.`
        );
        console.log(`[standTakedownReminders] 3-day push for "${camp.label}": sent to ${successCount} devices`);
        updates.push(doc.ref.update({ reminder3Sent: true }));
      }
    }

    await Promise.all(updates);
    return null;
  });

exports.sendBroadcast = functions
  .region('us-central1')
  .firestore.document('broadcasts/{id}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const tokenMap = await getTokenMap();
    const allEntries = Object.values(tokenMap).flat();
    const { successCount, failureCount } = await sendPush(
      allEntries,
      data.title || 'עדכון מ-NIZAT HUB',
      data.body || ''
    );
    console.log(`[sendBroadcast] "${data.title}": sent to ${successCount} devices, ${failureCount} failed`);
    return snap.ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp(), successCount, failureCount });
  });
