
/* ---------- Firebase config (מלא לאחר יצירת הפרויקט) ---------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9xW53EN2e6IjwrI7r6KU5uZAHOHPpLtY",
  authDomain: "nizat-hub.firebaseapp.com",
  projectId: "nizat-hub",
  storageBucket: "nizat-hub.firebasestorage.app",
  messagingSenderId: "155707428898",
  appId: "1:155707428898:web:5d56d241b1523d340d7a7b"
};
/* דומיין ה-Workspace שדרכו מותר להתחבר בפועל (Google Sign-In מוגבל אליו) */
const ALLOWED_GOOGLE_DOMAIN = "nizat.co.il";
/* ============================================================
   מחלקות וצוות
   ------------------------------------------------------------
   DEPARTMENTS: המחלקות שה-HUB יכול לשרת. כרגע כל התוכן הקיים שייך
   ל'marketing' — שאר המחלקות מוגדרות מראש כדי שהוספת תוכן שלהן בעתיד
   תהיה שינוי של שורה אחת ולא פרויקט.

   STAFF: מי מקבל גישת ניהול ולאילו מחלקות. departments:['*'] = גישה מלאה.
   הערה חשובה: תוכן בלי שדה department נחשב אוטומטית ל'marketing', ולכן
   כל הנתונים הקיימים ממשיכים לעבוד בדיוק כמו קודם — בלי migration.
   ============================================================ */
const DEPARTMENTS = {
  marketing:  { label: 'מחלקת שיווק',      short: 'שיווק' },
  operations: { label: 'מחלקת תפעול',      short: 'תפעול' },
  purchasing: { label: 'מחלקת רכש',        short: 'רכש' },
  hr:         { label: 'משאבי אנוש',       short: 'משאבי אנוש' }
};
const DEFAULT_DEPARTMENT = 'marketing';

const STAFF = {
  /* שיווק */
  'inbar@nizat.co.il':  { name: 'ענבר',            title: 'מנהלת שיווק',              departments: ['marketing'] },
  'yulia@nizat.co.il':  { name: 'יוליה',           title: 'סמנכ"ל שיווק וחדשנות',      departments: ['marketing'] },
  /* משאבי אנוש */
  'ori@nizat.co.il':    { name: 'אורי מנקדי',      departments: ['hr'] },
  'orit@nizat.co.il':   { name: 'אורית אביב',      departments: ['hr'] },
  /* רכש */
  'edith@nizat.co.il':  { name: 'אדית לייבוביץ\'', title: 'סמנכ"לית רכש',             departments: ['purchasing'] },
  'nofar@nizat.co.il':  { name: 'נופר שרר',        title: 'ע. סמנכ"לית רכש',          departments: ['purchasing'] },
  'tradeo@nizat.co.il': { name: 'שירן סוסקין',     title: 'רכש',                      departments: ['purchasing'] },
  /* תפעול */
  'tzach@nizat.co.il':  { name: 'צח שווקי',        departments: ['operations'] },
  /* גישה מלאה */
  'eliran@nizat.co.il': { name: 'אלירן',           title: 'IT',                        departments: ['*'] },
  'ai@nizat.co.il':     { name: 'ניהול מערכת',     departments: ['*'] }
};

/* נגזר אוטומטית מ-STAFF — נשאר לתאימות עם קוד קיים שמשתמש ב-ADMIN_EMAILS. */
const ADMIN_EMAILS = Object.keys(STAFF);

/* המחלקות שהמשתמש הנוכחי רשאי לנהל. '*' מתורגם לכל המחלקות. */
function staffDepartments(email){
  const rec = STAFF[email];
  if(!rec) return [];
  return rec.departments.indexOf('*') !== -1 ? Object.keys(DEPARTMENTS) : rec.departments;
}
/* האם המשתמש הנוכחי רשאי לנהל תוכן של מחלקה מסוימת. */
function canManageDepartment(dept){
  if(session.role !== 'marketing') return false;
  return staffDepartments(currentUserEmail).indexOf(dept || DEFAULT_DEPARTMENT) !== -1;
}
/* המחלקה של פריט תוכן — ברירת מחדל 'marketing' לכל התוכן הקיים. */
function itemDepartment(item){
  return (item && item.department) || DEFAULT_DEPARTMENT;
}

/* מנהלי אזור: כל אחד רואה ברירת מחדל את הסניפים באזור שלו (מותאם לפי השם
   הפרטי המופיע כבר בשדה "areaManager"/"מנהל אזור" בתחרויות), פלוס השוואה
   לשאר האזורים. areaName=null = תצוגה ארצית (רואה הכל, לא רק אזור אחד).
   title: התפקיד/האזור הגאוגרפי המדויק, לתצוגה בכל מקום שמציג את שם
   האדם (ברכות, כותרות מסך וכו') - לא רק "מנהל אזור" גנרי. */
const AREA_MANAGER_INFO = {
  'amir@nizat.co.il': {areaName:'אמיר', label:'אמיר', title:'מנהל איזור דרום'},
  'lior@nizat.co.il': {areaName:'ליאור', label:'ליאור', title:'מנהלת איזור השרון'},
  'shiran@nizat.co.il': {areaName:'שירן', label:'שירן', title:'מנהלת איזור צפון'},
  'naor@nizat.co.il': {areaName:'נאור', label:'נאור', title:'מנהל איזור ירושלים והסביבה'},
  'shahar@nizat.co.il': {areaName:'שחר', label:'שחר', title:'מנהל איזור ת"א'},
  'nati@nizat.co.il': {areaName:'נתי', label:'נתי', title:'מנהל איזור מישור החוף הצפוני'},
  'ofer@nizat.co.il': {areaName:null, label:'עופר', title:'מנהל חנויות ארצי'},
  'arbel@nizat.co.il': {areaName:null, label:'ארבל', title:'מנכ"ל'}
};

/* מיילים "מאחורי הקלעים" שיכולים לראות תוכן פרטי של מנהלי אזור (הוראות
   לסניפים, אישורי קבלה) גם בלי להיות מנהל האזור עצמו או הסניף היעד -
   לצורך תמיכה/פיתוח בלבד, לא לפיקוח ניהולי. רשימה סגורה בכוונה. */
const AREA_PRIVATE_BACKEND_EMAILS = ['eliran@nizat.co.il', 'ai@nizat.co.il'];
function isAreaPrivateBackendUser(){
  return currentUserEmail && AREA_PRIVATE_BACKEND_EMAILS.indexOf(currentUserEmail) !== -1;
}
/* מנהל אזור "אמיתי" (נאור/שחר/אמיר/נתי/שירן/ליאור) - להבדיל מארבל/עופר
   שהם תצוגה ארצית (areaName=null) ולא אחראים על קבוצת סניפים ספציפית. */
function isRealAreaManager(){
  return session.role==='area' && !!session.areaName;
}
/* יומן אישי של מנהל הסניף - סגנון חופשי לגמרי (בלי קטגוריות קבועות):
   טקסט חופשי + בחירת צבע נעים מתוך פלטה קטנה, כדי שהריבוע בלוח השנה
   עדיין יצבע יפה בלי לכפות משמעות/קטגוריה על התוכן. */
const CALENDAR_NOTE_COLORS = ['#F6C9D6', '#C6DCF0', '#F5DDB0', '#CFE8CB', '#E2D3F0', '#DADADA'];
/* חגי ישראל — טבלה סטטית קשיחה, בלי שום תלות חיצונית (לא ספרייה, לא API).
   נבדקו מול כמה מקורות ומדויקים לטווח ספטמבר 2026 - יוני 2027. הרחבה לשנים
   הבאות (2028 ואילך) דורשת בדיקה נפרדת של תאריכים מדויקים לפני הוספה -
   מקורות אונליין לשנים רחוקות יותר לעיתים סותרים זה את זה, אז עדיף להוסיף
   בהדרגה ולוודא מול מקור אמין (למשל hebcal.com) בקרבת הזמן, ולא לנחש קדימה.
   מבנה: date/endDate בפורמט DD.MM.YYYY (כמו בכל האפליקציה), title בעברית.
   חג ללא endDate הוא חג של יום אחד. */
const ISRAELI_HOLIDAYS = [
  { date:'11.09.2026', endDate:'13.09.2026', title:'ראש השנה' },
  { date:'20.09.2026', endDate:'21.09.2026', title:'יום כיפור' },
  { date:'25.09.2026', endDate:'03.10.2026', title:'סוכות ושמחת תורה' },
  { date:'04.12.2026', endDate:'12.12.2026', title:'חנוכה' },
  { date:'23.01.2027', title:'ט"ו בשבט' },
  { date:'23.03.2027', title:'פורים' },
  { date:'21.04.2027', endDate:'28.04.2027', title:'פסח' },
  { date:'11.05.2027', title:'יום הזיכרון' },
  { date:'12.05.2027', title:'יום העצמאות' },
  { date:'25.05.2027', title:'ל"ג בעומר' },
  { date:'11.06.2027', title:'שבועות' }
];
const EMAILJS_PUBLIC_KEY = 'eq7sWskivLRMUK7xF';
const EMAILJS_SERVICE_ID = 'service_7n4616e';
const EMAILJS_TEMPLATE_ID = 'template_hog7ghr';
let emailjsReady = false;
try {
  if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    emailjsReady = true;
  }
} catch (err) {
  console.warn('EmailJS לא הופעל:', err);
}
function sendPrivateMessageEmail(branchName, itemTitle, text){
  if (!emailjsReady) return;
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    branch_name: branchName,
    item_title: itemTitle,
    message_text: text
  }).catch(function(err){
    console.error('שליחת מייל אוטומטי נכשלה:', err);
  });
}

/* ---------- Cloudinary — אחסון קבצים אמיתיים (מודול "חומרים להורדה") ----------
   שירות חיצוני חינמי (בלי כרטיס אשראי) להעלאת קבצים ישירות מהדפדפן, בלי שרת.
   resource_type: 'auto' מזהה את סוג הקובץ אוטומטית (תמונה/וידאו/מסמך גולמי). */
const CLOUDINARY_CLOUD_NAME = 'jfyamj8m';
const CLOUDINARY_UPLOAD_PRESET = 'nizat_hub_materials';
function uploadFileToCloudinary(file){
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  return fetch(url, { method: 'POST', body: formData })
    .then(res => {
      if(!res.ok) throw new Error('שגיאת שרת בהעלאה (' + res.status + ')');
      return res.json();
    });
}
function formatFileSize(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

let fbApp = null, fbAuth = null, db = null, messaging = null;
let firebaseReady = false;
let currentUserEmail = null;
/* מפתח VAPID לפוש אמיתי (Web Push) — נוצר ב-Firebase Console → Project Settings →
   Cloud Messaging → Web Push certificates → Generate key pair. יש להחליף את
   הפלייסהולדר הזה במפתח האמיתי לפני שהתראות Push יעבדו בפועל. */
const FCM_VAPID_KEY = "BLlvnaiao13_gaRxRdxWVM4ZcV3CoWN7B0lH3H0ngWpQH3tXUIPN8lzaj_lTpQJOAFiSslQHfROhbOL-prSLbk0";
try {
  if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey.indexOf('PLACEHOLDER') === -1) {
    fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    db = firebase.firestore();
    firebaseReady = true;
    if(firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported()){
      messaging = firebase.messaging();
      console.log('🔔 [NIZAT-DEBUG] messaging אותחל:', messaging);
    } else {
      console.warn('🔔 [NIZAT-DEBUG] messaging לא אותחל — firebase.messaging לא זמין');
    }
    fbAuth.onAuthStateChanged(function(user){
      currentUserEmail = user ? normalizeEmail(user.email) : null;
    });
  }
} catch (err) {
  console.warn('Firebase לא הופעל (עדיין בקונפיג דמו):', err);
}

/* ---------- Google Sign-In מוגבל לדומיין nizat.co.il ---------- */
/* לוגיקת זיהוי תפקיד לפי מייל — משותפת לכניסה חדשה (nizatGoogleSignIn) ולשחזור
   הפעלה קיימת (initLogin). מחזירה true אם זוהה תפקיד ו-enterApp נקרא. */
function resolveSessionForEmail(email){
  if (email === MARKETING_CONTACT_EMAIL || ADMIN_EMAILS.indexOf(email) !== -1) {
    enterApp('marketing', null);
    return true;
  }
  if (AREA_MANAGER_INFO[email]) {
    enterApp('area', AREA_MANAGER_INFO[email]);
    return true;
  }
  const branch = findBranchByEmail(email);
  if (branch) {
    saveIdentity(branch.email);
    enterApp('branch', branch);
    return true;
  }
  return false;
}
function nizatGoogleSignIn(){
  if (!firebaseReady) {
    toast('כדי להשתמש בכניסת Google, יש קודם למלא את קונפיג Firebase בקוד (ראו ההערה בראש הקובץ).');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ hd: ALLOWED_GOOGLE_DOMAIN });
  fbAuth.signInWithPopup(provider).then(function(result){
    const email = normalizeEmail(result.user.email);
    if (email.split('@')[1] !== ALLOWED_GOOGLE_DOMAIN) {
      fbAuth.signOut();
      toast('יש להתחבר עם חשבון Google בדומיין ' + ALLOWED_GOOGLE_DOMAIN + ' בלבד.');
      return;
    }
    currentUserEmail = email;
    // ספר הסניפים (עם טלפון/כתובת) נטען מ-Firestore רק אחרי אימות מוצלח —
    // הוא כבר לא חלק מהקוד הציבורי.
    loadBranchDirectory().then(function(){
      if (!resolveSessionForEmail(email)) {
        toast('כתובת המייל ' + email + ' לא מזוהה במאגר הסניפים. פנו למחלקת השיווק להוספה.');
      }
    });
    return;
  }).catch(function(err){
    console.error(err);
    toast('ההתחברות נכשלה: ' + (err.message || err));
  });
}

/* ---------- Firestore sync — פיילוט למודול "הוראות ועדכונים" ----------
   ברגע שיש חיבור Firestore פעיל, appData.instructions מוחלף בזמן-אמת
   ע"י onSnapshot, במקום המערך המקומי. שאר המודולים (חומרים/אירועים/
   ביצועים/סטנדים) ממשיכים כרגיל ויעברו לאותה תבנית בהמשך. */
let unsubInstructions = null;
let instructionsFirstSnapshot = true;
let unsubComments = null;
let unsubPrivateMessages = null;
let unsubCompetitions = null;
let unsubMaterials = null;
let unsubEvents = null;
let unsubStandCampaigns = null;
let unsubStandConfirmations = null;
let unsubStandTakedownAcks = null;
let unsubInstructionCompletions = null;
let unsubItemReads = null;
let unsubBroadcasts = null;
let unsubPromoProducts = null;
let unsubPromoBooklet = null;
let unsubAreaInstructions = null;
let unsubAreaInstructionConfirmations = null;
let unsubBranchCalendarNotes = null;
let unsubBranchCalendarNotesLegacy = null;
let unsubAreaCalendarEvents = null;
let unsubViewerActivity = null;
let unsubPwaInstalls = null;
let unsubMaterialTags = null;
let unsubSiteTexts = null;
const FIRESTORE_BACKED_TYPES = ['instructions', 'competitions', 'materials', 'events'];
/* היומן שלי — סינכרון עצמאי, נפרד מהזרימה הרגילה של initFirestoreSync().
   הסיבה: session.role / session.branchInfo / currentUserEmail יכולים
   להשתנות גם בלי כניסה מחדש (למשל "צפייה כמשתמש" למנהל תוכן) - ובלי
   הפונקציה הזו, ה-listener היה ממשיך לשאול על הזהות הישנה לנצח, בשקט,
   בלי שום שגיאה גלויה. myCalSyncedFor שומר "טביעת אצבע" של הזהות
   הפעילה בזמן שהסינכרון האחרון רץ; viewMyCalendar() קורא לפונקציה הזו
   בכל רינדור, וכשהטביעת אצבע משתנה - היא בונה את שני ה-listeners מחדש. */
let myCalSyncedFor = null;
function currentMyCalendarIdentityKey(){
  return [currentUserEmail||'', session.role||'', (session.branchInfo?session.branchInfo.email:''), session.areaLabel||''].join('|');
}
function syncMyCalendarData(){
  const key = currentMyCalendarIdentityKey();
  if(key === myCalSyncedFor) return;
  myCalSyncedFor = key;

  /* תזכורות אישיות. במקור זה היה מיועד לסניפים בלבד (branchEmail בלבד).
     כעת זמין לכל תפקיד, לפי שדה ownerEmail גנרי. לתאימות אחורה, סניפים
     ממשיכים גם לקרוא לפי branchEmail (מסמכים ישנים שנוצרו לפני ההרחבה),
     וממזגים את שתי התוצאות לאותו appData.branchCalendarNotes (השם נשאר,
     רק האוכלוסיה מתרחבת). כל משתמש רואה רק את שלו - בלי קשר לתפקיד. */
  if (unsubBranchCalendarNotes) unsubBranchCalendarNotes();
  if (unsubBranchCalendarNotesLegacy) unsubBranchCalendarNotesLegacy();
  let myCalOwnerDocs = [], myCalLegacyDocs = [];
  function mergeMyCalendarNotes(){
    const merged = [...myCalOwnerDocs];
    myCalLegacyDocs.forEach(function(d){ if(!merged.find(function(x){return x.id===d.id;})) merged.push(d); });
    appData.branchCalendarNotes = merged;
    renderContent();
  }
  if (currentUserEmail) {
    unsubBranchCalendarNotes = db.collection('branchCalendarNotes')
      .where('ownerEmail', '==', currentUserEmail)
      .onSnapshot(function(snap){
        myCalOwnerDocs = snap.docs.map(function(doc){ return Object.assign({}, doc.data(), { id: doc.id }); });
        mergeMyCalendarNotes();
      }, function(err){ console.error('Firestore sync error (calendar notes - owner):', err); });
    if (session.role==='branch' && session.branchInfo && session.branchInfo.email) {
      unsubBranchCalendarNotesLegacy = db.collection('branchCalendarNotes')
        .where('branchEmail', '==', session.branchInfo.email)
        .onSnapshot(function(snap){
          myCalLegacyDocs = snap.docs.map(function(doc){ return Object.assign({}, doc.data(), { id: doc.id }); });
          mergeMyCalendarNotes();
        }, function(err){ console.error('Firestore sync error (calendar notes - legacy):', err); });
    } else {
      myCalLegacyDocs = [];
      mergeMyCalendarNotes();
    }
  } else {
    appData.branchCalendarNotes = [];
  }

  /* אירועים משותפים שמנהל אזור יוצר לסניף אחד/מספר סניפים. קולקציה נפרדת
     לגמרי מ-events (יומן השיווק) ומ-areaInstructions - כדי שלא לגעת בכלל
     בהרשאות/יציבות של יומן השיווק הקיים. סניף רואה רק אירועים שהוא ביעד
     שלהם, מנהל אזור רואה רק מה שהוא עצמו יצר. */
  if (unsubAreaCalendarEvents) unsubAreaCalendarEvents();
  let areaCalQuery = null;
  if (isAreaPrivateBackendUser()) {
    areaCalQuery = db.collection('areaCalendarEvents');
  } else if (session.role==='branch' && session.branchInfo && session.branchInfo.email) {
    areaCalQuery = db.collection('areaCalendarEvents').where('targetBranchEmails', 'array-contains', session.branchInfo.email);
  } else if (isRealAreaManager()) {
    areaCalQuery = db.collection('areaCalendarEvents').where('areaManagerEmail', '==', currentUserEmail);
  }
  if (areaCalQuery) {
    unsubAreaCalendarEvents = areaCalQuery.onSnapshot(function(snap){
      appData.areaCalendarEvents = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){ console.error('Firestore sync error (area calendar events):', err); });
  } else {
    appData.areaCalendarEvents = [];
  }
}

function initFirestoreSync(){
  if (!firebaseReady || !db) return;
  instructionsFirstSnapshot = true;
  if (unsubInstructions) unsubInstructions();
  unsubInstructions = db.collection('instructions').orderBy('createdAt', 'desc')
    .onSnapshot(function(snap){
      appData.instructions = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id });
      });
      /* התראה עם נקודה אדומה + מספר בפעמון רק על הוראות/עדכונים חדשים שנוספו בזמן אמת
         (לא בטעינה הראשונית של כל הרשומות הקיימות), ורק לצד הצופה (סניף/מנהל אזור) —
         לא למחלקת השיווק עצמה שפרסמה את זה. */
      if(instructionsFirstSnapshot){
        instructionsFirstSnapshot = false;
      } else if(session.role !== 'marketing'){
        let hasNew = false;
        snap.docChanges().forEach(function(change){
          if(change.type === 'added'){
            const d = change.doc.data();
            addNotification({
              id: Date.now() + Math.random(),
              title: 'עדכון חדש מהשיווק',
              body: d.title,
              date: todayHeb(), type:'instruction', read:false
            });
            hasNew = true;
          }
        });
        if(hasNew) renderNotifPanel();
      }
      renderContent();
      renderNav();
    }, function(err){
      console.error('Firestore sync error (instructions):', err);
      toast('שגיאה בסנכרון הוראות מ-Firestore: ' + err.message);
    });

  if (unsubComments) unsubComments();
  unsubComments = db.collection('comments').orderBy('createdAt', 'desc')
    .onSnapshot(function(snap){
      appData.comments = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (comments):', err);
      toast('שגיאה בסנכרון תגובות מ-Firestore: ' + err.message);
    });

  if (unsubPrivateMessages) unsubPrivateMessages();
  unsubPrivateMessages = db.collection('privateMessages').orderBy('createdAt', 'desc')
    .onSnapshot(function(snap){
      appData.privateMessages = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id, replies: d.replies || [] });
      });
      renderContent();
      renderNotifPanel();
    }, function(err){
      console.error('Firestore sync error (private messages):', err);
      toast('שגיאה בסנכרון הודעות פרטיות מ-Firestore: ' + err.message);
    });

  if (unsubCompetitions) unsubCompetitions();
  unsubCompetitions = db.collection('competitions')
    .onSnapshot(function(snap){
      appData.competitions = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (competitions):', err);
      toast('שגיאה בסנכרון תחרויות מ-Firestore: ' + err.message);
    });

  if (unsubMaterials) unsubMaterials();
  unsubMaterials = db.collection('materials').orderBy('createdAt', 'desc')
    .onSnapshot(function(snap){
      appData.materials = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (materials):', err);
      toast('שגיאה בסנכרון חומרים מ-Firestore: ' + err.message);
    });

  if (unsubEvents) unsubEvents();
  unsubEvents = db.collection('events').orderBy('createdAt', 'desc')
    .onSnapshot(function(snap){
      appData.events = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (events):', err);
      toast('שגיאה בסנכרון אירועים מ-Firestore: ' + err.message);
    });

  if (unsubStandCampaigns) unsubStandCampaigns();
  unsubStandCampaigns = db.collection('standCampaigns')
    .onSnapshot(function(snap){
      appData.standCampaigns = snap.docs.map(function(doc){
        const d = doc.data();
        return Object.assign({}, d, { id: doc.id });
      });
      renderContent();
      checkStandReminders();
    }, function(err){
      console.error('Firestore sync error (stand campaigns):', err);
      toast('שגיאה בסנכרון סטנדים מ-Firestore: ' + err.message);
    });

  /* אישורי סטנדים לפי סניף — קולקציה נפרדת (כל מסמך שייך לסניף אחד בלבד, מזוהה לפי המייל שלו).
     זה מה שמאפשר לכללי ה-Firestore להגביל: רק הסניף עצמו (או מחלקת שיווק) יכול לגעת באישור שלו,
     בניגוד למבנה הקודם שבו כל אישור עדכן מערך משותף של קמפיין שלם. */
  if (unsubStandConfirmations) unsubStandConfirmations();
  unsubStandConfirmations = db.collection('standConfirmations')
    .onSnapshot(function(snap){
      appData.standConfirmations = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (stand confirmations):', err);
    });

  /* אישורי "ראיתי, אוריד את הסטנד" (תזכורת 3 ימים לפני הורדה, חובה לאשר) —
     קולקציה נפרדת לפי סניף, באותה שיטה בדיוק כמו standConfirmations. כל עוד
     הסניף לא אישר, הבאנר ממשיך להופיע אצלו בכל טעינה — זה לא נגזר מ"נקרא"
     אלא מהיעדר מסמך אישור בפועל. */
  if (unsubStandTakedownAcks) unsubStandTakedownAcks();
  unsubStandTakedownAcks = db.collection('standTakedownAcks')
    .onSnapshot(function(snap){
      appData.standTakedownAcks = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (stand takedown acks):', err);
    });

  syncMyCalendarData();


  if (unsubAreaInstructions) unsubAreaInstructions();
  if (unsubAreaInstructionConfirmations) unsubAreaInstructionConfirmations();
  let areaInstrQuery = null, areaInstrConfQuery = null;
  if (isAreaPrivateBackendUser()) {
    areaInstrQuery = db.collection('areaInstructions');
    areaInstrConfQuery = db.collection('areaInstructionConfirmations');
  } else if (session.role==='branch' && session.branchInfo && session.branchInfo.email) {
    areaInstrQuery = db.collection('areaInstructions').where('targetBranchEmails', 'array-contains', session.branchInfo.email);
    areaInstrConfQuery = db.collection('areaInstructionConfirmations').where('branchEmail', '==', session.branchInfo.email);
  } else if (isRealAreaManager()) {
    areaInstrQuery = db.collection('areaInstructions').where('areaManagerEmail', '==', currentUserEmail);
    areaInstrConfQuery = db.collection('areaInstructionConfirmations').where('areaManagerEmail', '==', currentUserEmail);
  }
  if (areaInstrQuery) {
    unsubAreaInstructions = areaInstrQuery.onSnapshot(function(snap){
      appData.areaInstructions = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (area instructions):', err);
    });
  } else {
    appData.areaInstructions = [];
  }
  if (areaInstrConfQuery) {
    unsubAreaInstructionConfirmations = areaInstrConfQuery.onSnapshot(function(snap){
      appData.areaInstructionConfirmations = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (area instruction confirmations):', err);
    });
  } else {
    appData.areaInstructionConfirmations = [];
  }

  /* ביצועי משימות "נדרש ביצוע" — קולקציה נפרדת, מסמך אחד לכל צירוף הוראה+סניף
     (בדיוק כמו standConfirmations), כדי לא להחזיק מערך של כל הסניפים בתוך
     מסמך ההוראה עצמו. */
  if (unsubInstructionCompletions) unsubInstructionCompletions();
  unsubInstructionCompletions = db.collection('instructionCompletions')
    .onSnapshot(function(snap){
      appData.instructionCompletions = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (instruction completions):', err);
    });

  /* מעקב "נקרא" אישי לכל צופה (סניף/מנהל אזור) — קולקציה נפרדת, מסמך אחד לכל
     צירוף (סוג תוכן + מזהה פריט + מזהה צופה), באותה שיטה בדיוק כמו
     instructionCompletions. כך "עדכון חדש"/עיגול אדום נעלמים רק אצל מי שבאמת צפה,
     ולא אצל כל הסניפים ברשת יחד. */
  if (unsubItemReads) unsubItemReads();
  unsubItemReads = db.collection('itemReads')
    .onSnapshot(function(snap){
      appData.itemReads = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderNav();
      renderContent();
    }, function(err){
      console.error('Firestore sync error (item reads):', err);
    });

  /* היסטוריית שידורי Push (broadcasts) — לשימוש בתצוגת "מי קרא" למחלקת השיווק
     בטאב "שידור עדכון". */
  if (unsubBroadcasts) unsubBroadcasts();
  unsubBroadcasts = db.collection('broadcasts').orderBy('sentAt', 'desc').limit(NOTIF_MAX_COUNT)
    .onSnapshot(function(snap){
      appData.broadcasts = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      if(session.role==='marketing') renderContent();
    }, function(err){
      console.error('Firestore sync error (broadcasts):', err);
    });

  /* נתוני מכר מבצעים (רכש) — כל מסמך הוא מוצר/מבצע עם מכירות פר-סניף
     (branchSales: {מספר סניף: כמות}). קולקציה קטנה יחסית (מאות מסמכים
     לכל היותר), נטענת במלואה. */
  if (unsubPromoProducts) unsubPromoProducts();
  unsubPromoProducts = db.collection('promoProducts')
    .onSnapshot(function(snap){
      appData.promoProducts = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      _promoAreaGroupCache = {};
      renderContent();
    }, function(err){
      console.error('Firestore sync error (promo products):', err);
    });

  /* פעילות צופים (מי נכנס ומתי) - רק לתצוגת מחלקת שיווק ב"סטטיסטיקות". */
  if(session.role==='marketing'){
    if(unsubViewerActivity) unsubViewerActivity();
    unsubViewerActivity = db.collection('viewerActivity')
      .onSnapshot(function(snap){
        appData.viewerActivity = snap.docs.map(function(doc){
          return Object.assign({}, doc.data(), { id: doc.id });
        });
        renderContent();
      }, function(err){
        console.error('Firestore sync error (viewer activity):', err);
      });
  }

  /* מטא-דאטה של חוברת המבצעים החודשית (רכש) — מסמך אחד לכל קוד מבצע:
     תבנית מכירה (2 יח' ב-/מוצר שני ב-%/וכו'), מחיר, הערות תצוגה, סעיף
     בחוברת (במה עדיפות/מקרר בולט/וכו'), הגבלת סניפים (למשל "ביו מרקט"
     בלבד), קוד מבצע שאליו זה מתאחד (mergedInto) ודגל "חסרה רשימת
     משתתפים" (needsParticipantList). קולקציה קטנה (מאות מסמכים לכל
     היותר), נטענת במלואה - בדיוק כמו promoProducts. */
  if (unsubPromoBooklet) unsubPromoBooklet();
  unsubPromoBooklet = db.collection('promoBooklet')
    .onSnapshot(function(snap){
      appData.promoBooklet = {};
      snap.docs.forEach(function(doc){
        appData.promoBooklet[doc.id] = doc.data();
      });
      _promoAreaGroupCache = {};
      renderContent();
    }, function(err){
      console.error('Firestore sync error (promo booklet):', err);
    });

  /* תוספות למיפוי קיצורי-עמודה→סניף במכר מבצעים, שנלמדו לאחר ה-DEFAULT
     המוטבע בקוד (למשל סניף חדש שנפתח). מסמך אחד קטן, לא צריך unsubscribe
     נפרד — נטען פעם אחת מספיק כי הוא כמעט אף פעם לא משתנה. */
  db.collection('config').doc('promoColumnMapping').get().then(function(doc){
    appData.promoColumnMappingExtra = doc.exists ? (doc.data().mapping || {}) : {};
  }).catch(function(err){
    console.error('Firestore sync error (promo column mapping):', err);
  });

  /* מעקב מי התקין את ה-PWA (כתובה ע"י הסקריפט הנפרד בתחתית הדף, ב-appinstalled) —
     מוצג רק למחלקת השיווק, במסך "ניהול תוכן". */
  if (unsubPwaInstalls) unsubPwaInstalls();
  unsubPwaInstalls = db.collection('pwaInstalls')
    .onSnapshot(function(snap){
      appData.pwaInstalls = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (pwa installs):', err);
    });

  /* תגיות מותאמות אישית שמחלקת השיווק יוצרת לחומרי שיווק, בנוסף לתגיות המובנות. */
  if (unsubMaterialTags) unsubMaterialTags();
  unsubMaterialTags = db.collection('materialTags')
    .onSnapshot(function(snap){
      appData.materialTags = snap.docs.map(function(doc){
        return Object.assign({}, doc.data(), { id: doc.id });
      });
      renderContent();
    }, function(err){
      console.error('Firestore sync error (material tags):', err);
    });

  if (unsubSiteTexts) unsubSiteTexts();
  unsubSiteTexts = db.collection('siteTexts').doc('main')
    .onSnapshot(function(doc){
      appData.siteTexts = doc.exists ? doc.data() : {};
      renderContent();
    }, function(err){
      console.error('Firestore sync error (site texts):', err);
    });
}

/* ---------- תווית סטטוס Firebase — כדי שלא יהיה ספק אם המערכת מחוברת בפועל ---------- */
function renderFirebaseStatusBadge(){
  const el = document.getElementById('fb-status-badge');
  if (!el) return;
  if (firebaseReady) {
    el.textContent = '🟢 Firebase מחובר (הפרויקט nizat-hub) — פעולות בהוראות נשמרות באמת';
    el.style.background = 'rgba(12,163,12,0.10)';
    el.style.color = '#0ca30c';
  } else {
    el.textContent = '🔴 Firebase לא מחובר — הכניסה עם Google ופעולות בהוראות לא יישמרו באמת עכשיו';
    el.style.background = 'rgba(208,59,59,0.10)';
    el.style.color = '#d03b3b';
  }
}
document.addEventListener('DOMContentLoaded', renderFirebaseStatusBadge);
renderFirebaseStatusBadge();
