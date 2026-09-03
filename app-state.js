/* ============================================================
   DATA (demo/sample content — in-memory only)
============================================================ */
/* ספר הסניפים (טלפון/נייד/כתובת) עבר להיות מאוחסן ב-Firestore בלבד
   (config/branchDirectory), ולא בקוד הציבורי — כדי שלא יהיה קריא לכל
   מי שנכנס לכתובת האתר בלי להתחבר (אפילו דרך Ctrl+U, בלי Google login).
   נטען בפועל ע"י loadBranchDirectory() אחרי אימות מוצלח.
   הרשימה כאן היא fallback להדגמה בלבד למצב שבו Firebase לא מוגדר. */
const DEMO_BRANCH_DIRECTORY = [
  {name:"סניף לדוגמה 1", email:"demo1@example.com", manager:"דמו", phone:"000-0000000", mobile:"000-0000000", area:"דמו", address:"כתובת לדוגמה"},
  {name:"סניף לדוגמה 2", email:"demo2@example.com", manager:"דמו", phone:"000-0000000", mobile:"000-0000000", area:"דמו", address:"כתובת לדוגמה"}
];
let BRANCH_DIRECTORY = firebaseReady ? [] : DEMO_BRANCH_DIRECTORY;
let branchDirectoryPromise = null;
function loadBranchDirectory(){
  if (!firebaseReady) return Promise.resolve(BRANCH_DIRECTORY);
  if (branchDirectoryPromise) return branchDirectoryPromise;
  branchDirectoryPromise = db.collection("config").doc("branchDirectory").get().then(function(doc){
    BRANCH_DIRECTORY = doc.exists ? (doc.data().list || []) : [];
    return BRANCH_DIRECTORY;
  }).catch(function(err){
    console.error("Firestore error (branch directory):", err);
    branchDirectoryPromise = null; // allow retry on next attempt
    return BRANCH_DIRECTORY;
  });
  return branchDirectoryPromise;
}
function getTotalBranches(){ return BRANCH_DIRECTORY.length; }
/* רישום פעילות כניסה - מסמך אחד לכל צופה (סניף/מנהל אזור/צוות), מתעדכן
   בכל כניסה: מונה ביקורים + תאריך אחרון. לא לוג מפורט של כל כניסה בנפרד -
   מספיק בשביל השאלה "מי בכלל נכנס ומתי", בלי לייצר קולקציה שגדלה בלי גבול. */
function logViewerActivity(role, payload){
  if(!firebaseReady || !db) return;
  let vid, label;
  if(role==='branch'){ vid = 'branch:' + (payload.email||payload.name); label = payload.name; }
  else if(role==='area'){ vid = 'area:' + payload.label; label = 'מנהל אזור · ' + payload.label; }
  else { vid = 'marketing:' + currentUserEmail; label = marketingDisplayFor(currentUserEmail).name; }
  const docId = vid.replace(/[\/\s]/g,'_');
  db.collection('viewerActivity').doc(docId).set({
    viewerId: vid, label, role,
    visitCount: firebase.firestore.FieldValue.increment(1),
    lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSeenDate: todayHeb()
  }, {merge:true}).catch(err=>console.warn('viewer activity log failed (לא קריטי):', err));
}

let appData = {
  siteTexts: {},
  standConfirmations: [],
  standTakedownAcks: [],
  instructionCompletions: [],
  itemReads: [],
  pwaInstalls: [],
  materialTags: [],
  competitions: [
    {
      id: 1,
      title: "מבצע LAVIDO — חגי תשרי",
      category: "מכירות",
      status: "upcoming",
      start: "23.08.2026",
      end: "02.10.2026",
      prize: "",
      desc: "תחרות מכירות למותג LAVIDO לרגל חגי תשרי. הסניפים מחולקים לשלוש קבוצות לפי יעד מכירות — כל קבוצה עם יעד ופרסים משלה. עקבו אחר ההתקדמות שלכם מול היעד, מנהל האזור שלכם, והפרסים הניתנים לכל דירוג.",
      leaderboard: [],
      salesUpdatedAt: null,
      managerColors: {"שחר ירושלמי":"#AFABAB","ליאור עובדיה":"#9DC3E6","נתי עמית":"#CC66FF","שירן ארר":"#FBE5D6","אמיר בר הלל":"#F8CBAD","נאור מנקדי":"#C5E0B4"},
      groups: [
    {
      groupNum: 1, name: "קבוצה 1", target: 23000, colorHex: "#FFFF00",
      prizes: [{rank:1, label:"מקום ראשון:", text:"תלושים בשווי 350 ₪ נטורופת+350 ₪ מנהל+300 ₪ סניף"}, {rank:2, label:"מקום שני:", text:"תלושים בשווי 300 ₪ נטורופת+300 ₪ מנהל+250 ₪ סניף"}, {rank:3, label:"מקום שלישי:", text:"תלושים בשווי 250 ₪ נטורופת+250 ₪ מנהל+200 ₪ סניף"}, {rank:4, label:"מקום רביעי:", text:"תלושים בשווי 200 ₪ נטורופת+200 ₪ מנהל+200 ₪ סניף"}, {rank:5, label:"מקום חמישי:", text:"תלושים בשווי 200 ₪ נטורופת+200 ₪ מנהל+200 ₪ סניף"}],
      branches: [
        {rawName:"01-ניצת תל-אביב", name:"תל אביב", target:23000, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"03-ניצת הרצליה", name:"הרצליה", target:23000, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"07-ניצת זכרון יעקוב", name:"זכרון יעקוב", target:23000, sales:0, areaManager:"נתי עמית"},
        {rawName:"17-ניצת פרדס חנה", name:"פרדס חנה", target:23000, sales:0, areaManager:"נתי עמית"},
        {rawName:"18-ניצת רמת ישי", name:"רמת ישי", target:23000, sales:0, areaManager:"שירן ארר"},
        {rawName:"24-ניצת חורב חיפה", name:"חורב חיפה", target:23000, sales:0, areaManager:"שירן ארר"},
        {rawName:"25-ניצת כרמיאל", name:"כרמיאל", target:23000, sales:0, areaManager:"שירן ארר"},
        {rawName:"28-יקנעם", name:"יקנעם", target:23000, sales:0, areaManager:"שירן ארר"},
        {rawName:"43-ביג באר שבע", name:"ביג באר שבע", target:23000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"66-רמת גן", name:"רמת גן", target:23000, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"79-ביו מרקט", name:"ביו מרקט", target:23000, sales:0, areaManager:"נתי עמית"},
      ]
    },
    {
      groupNum: 2, name: "קבוצה 2", target: 14000, colorHex: "#FFC000",
      prizes: [{rank:1, label:"מקום ראשון:", text:"תלושים בשווי 300 ₪ נטורופת+300 ₪ מנהל+250 ₪ סניף"}, {rank:2, label:"מקום שני:", text:"תלושים בשווי 250 ₪ נטורופת+250 ₪ מנהל+200 ₪ סניף"}, {rank:3, label:"מקום שלישי:", text:"תלושים בשווי 200 ₪ נטורופת+200 ₪ מנהל+150 ₪ סניף"}, {rank:4, label:"מקום רביעי:", text:"תלושים בשווי 150 ₪ נטורופת+150 ₪ מנהל+150 ₪ סניף"}, {rank:5, label:"מקום חמישי:", text:"תלושים בשווי 150 ₪ נטורופת+150 ₪ מנהל+150 ₪ סניף"}],
      branches: [
        {rawName:"02-ניצת ירושלים", name:"ירושלים", target:14000, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"04-ניצת רעננה", name:"רעננה", target:14000, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"05-ניצת גוש חדש", name:"גוש חדש", target:14000, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"08-ניצת חיפה קומוי", name:"חיפה קומוי", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"09-ניצת פתח תקוה", name:"פתח תקוה", target:14000, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"11-ניצת קריית שמונה", name:"קריית שמונה", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"12-ניצת עפולה", name:"עפולה", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"13-ניצת אשקלון", name:"אשקלון", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"19-ניצת טבריה", name:"טבריה", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"26-ניצת באר שבע", name:"באר שבע", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"27-ניצת קריית אתא", name:"קריית אתא", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"32-רחובות", name:"רחובות", target:14000, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"34-מודיעין", name:"מודיעין", target:14000, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"36-קסטינה", name:"קסטינה", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"37-ברודצקי", name:"ברודצקי", target:14000, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"39-רגבה", name:"רגבה", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"40-אשדוד", name:"אשדוד", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"41-ראש פינה", name:"ראש פינה", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"42-חולון", name:"חולון", target:14000, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"44-תל מונד", name:"תל מונד", target:14000, sales:0, areaManager:"נתי עמית"},
        {rawName:"48-פתח תקווה יכין", name:"פתח תקוה יכין", target:14000, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"50-ניצת אילת", name:"אילת", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"51-טבעון", name:"טבעון", target:14000, sales:0, areaManager:"שירן ארר"},
        {rawName:"53-ירושליים ניות", name:"ירושליים ניות", target:14000, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"56-נתניה סמילנסקי", name:"נתניה סמילנסקי", target:14000, sales:0, areaManager:"נתי עמית"},
        {rawName:"57-חדרה", name:"חדרה", target:14000, sales:0, areaManager:"נתי עמית"},
        {rawName:"60-ירושליים אגריפס", name:"ירושליים אגריפס", target:14000, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"63-נתניה פיאנו עיר ימים", name:"נתניה פיאנו עיר ימים", target:14000, sales:0, areaManager:"נתי עמית"},
        {rawName:"65 הוד השרון", name:"הוד השרון", target:14000, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"67-ראשון מערב", name:"ראשון מערב", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"72-רחובות הרצל", name:"רחובות הרצל", target:14000, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"80-אור עקיבא", name:"אור עקיבא", target:14000, sales:0, areaManager:"נתי עמית"},
      ]
    },
    {
      groupNum: 3, name: "קבוצה 3", target: 8500, colorHex: "#92D050",
      prizes: [{rank:1, label:"מקום ראשון:", text:"תלושים בשווי 250 ₪ נטורופת+250 ₪ מנהל+200 ₪ סניף"}, {rank:2, label:"מקום שני:", text:"תלושים בשווי 200 ₪ נטורופת+200 ₪ מנהל+200 ₪ סניף"}, {rank:3, label:"מקום שלישי:", text:"תלושים בשווי 150 ₪ נטורופת+150 ₪ מנהל+150 ₪ סניף"}, {rank:4, label:"מקום רביעי:", text:"תלושים בשווי 100 ₪ נטורופת+100 ₪ מנהל+100 ₪ סניף"}, {rank:5, label:"מקום חמישי:", text:"תלושים בשווי 100 ₪ נטורופת+100 ₪ מנהל+100 ₪ סניף"}],
      branches: [
        {rawName:"14-ניצת בית שמש", name:"בית שמש", target:8500, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"15-ניצת שוק הכרמל", name:"שוק הכרמל", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"16-נתניה קריית השרון", name:"נתניה קריית השרון", target:8500, sales:0, areaManager:"נתי עמית"},
        {rawName:"20-ניצת בוגרשוב", name:"בוגרשוב", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"22-ניצת רמת השרון", name:"רמת השרון", target:8500, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"23-ניצת בינימינה", name:"בינימינה", target:8500, sales:0, areaManager:"נתי עמית"},
        {rawName:"33-ראשל``ץ", name:"ראשון לציון", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"35-ניצת אריאל", name:"אריאל", target:8500, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"38-כפר סבא", name:"כפר סבא", target:8500, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"45-טופ דן תל אביב", name:"טופ דן תל אביב", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"46-ביתר עלית", name:"ביתר עלית", target:8500, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"52-ק-מוצקין", name:"קריית מוצקין", target:8500, sales:0, areaManager:"שירן ארר"},
        {rawName:"54-יהודה המכבי", name:"יהודה המכבי", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"55-דיזנגוף", name:"דיזנגוף", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"59-יהוד", name:"יהוד", target:8500, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"61-גבעתיים", name:"גבעתיים", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"62-מבשרת ציון", name:"מבשרת ציון", target:8500, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"64-תלפיות", name:"תלפיות", target:8500, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"68-אפרת", name:"אפרת", target:8500, sales:0, areaManager:"נאור מנקדי"},
        {rawName:"69-פלורנטין", name:"פלורנטין", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"70-נהרייה", name:"נהרייה", target:8500, sales:0, areaManager:"שירן ארר"},
        {rawName:"71-יבנה", name:"יבנה", target:8500, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"73-שינקין", name:"שינקין", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"74-שרונה", name:"שרונה", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"75-קריית אונו", name:"קריית אונו", target:8500, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"76-מודיעין מרכז", name:"מודיעין מרכז", target:8500, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"77-אבן יהודה", name:"אבן יהודה", target:8500, sales:0, areaManager:"נתי עמית"},
        {rawName:"78-שהם", name:"שהם", target:8500, sales:0, areaManager:"ליאור עובדיה"},
        {rawName:"81-כרמי גת", name:"כרמי גת", target:8500, sales:0, areaManager:"אמיר בר הלל"},
        {rawName:"82-ויתקין", name:"ויתקין", target:8500, sales:0, areaManager:"נתי עמית"},
        {rawName:"83 חשמונאים", name:"חשמונאים", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"84-קדימה", name:"קדימה", target:8500, sales:0, areaManager:"נתי עמית"},
        {rawName:"85-כורזין גבעתיים", name:"כורזין גבעתיים", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"86-שוסטר רמת אביב", name:"שוסטר רמת אביב", target:8500, sales:0, areaManager:"שחר ירושלמי"},
        {rawName:"87 עד הלום- באר טוביה", name:"עד הלום באר טוביה", target:8500, sales:0, areaManager:"אמיר בר הלל"},
      ]
    },
  ]
    }
  ],
  instructions: [],
  materials: [],
  events: [],
  comments: [],
  privateMessages: [],
  standCampaigns: [],
  notifications: [],
  broadcasts: [],
  promoProducts: [],
  promoBooklet: {},
  viewerActivity: [],
  areaInstructions: [],
  areaInstructionConfirmations: [],
  branchCalendarNotes: [],
  areaCalendarEvents: [],
  promoColumnMappingExtra: {}
};

let nextIds = {competitions:2, instructions:1, materials:1, events:1, comments:1, privateMessages:1, standCampaigns:18};
const MARKETING_CONTACT_EMAIL = 'inbar@nizat.co.il';
const MARKETING_CONTACT_NAME = 'ענבר';

/* ---------- טקסטים ניתנים לעריכה ("ניהול תוכן" > טקסטים באתר) ----------
   כל טקסט כאן הוא ברירת מחדל; אם קיימת דריסה ב-Firestore (siteTexts/main)
   היא תוצג במקומו לכולם (כולל סניפים ומנהלי אזור) בזמן אמת. */
const SITE_TEXT_DEFAULTS = {
  competitions_desc: 'כל תחרויות המכירות והשירות הפעילות והעתידיות ברשת.',
  instructions_desc: 'הנחיות תפעוליות ועדכונים שוטפים ממחלקת השיווק וההנהלה.',
  materials_desc: 'באנרים, שילוט, מצגות ותמונות מוצר לשימוש הסניף.',
  stands_desc: 'מעקב אחר אישורי הצבת סטנדים בסניפים, לפי קמפיין. העלאת קובץ סורקת את כל הלשוניות בקובץ ומזהה תאים צבועים.',
  messages_desc_marketing: `הודעות שנשלחו אליכם ישירות מהסניפים (בנוסף, כל הודעה כזו פותחת גם טיוטת מייל ל-${MARKETING_CONTACT_EMAIL} אצל הסניף השולח).`,
  messages_desc_branch: `הודעות פרטיות ששלחתם ל${MARKETING_CONTACT_NAME} (מחלקת שיווק), ותשובותיה.`,
  admin_desc: 'עדכונים כאן משתקפים באופן מיידי בתצוגת כל הסניפים ברשת.'
};
const SITE_TEXT_LABELS = {
  competitions_desc: 'תחרויות — תיאור מתחת לכותרת',
  instructions_desc: 'הוראות ועדכונים — תיאור מתחת לכותרת',
  materials_desc: 'הורדה חומרי שיווק / דיגיטל ורשתות חברתיות — תיאור מתחת לכותרת',
  stands_desc: 'סטנדים לאישור — תיאור מתחת לכותרת',
  messages_desc_marketing: 'הודעות פרטיות — תיאור (בצד מחלקת השיווק)',
  messages_desc_branch: 'ההודעות שלי — תיאור (בצד הסניף)',
  admin_desc: 'ניהול תוכן — תיאור מתחת לכותרת'
};
function getText(key){
  return (appData.siteTexts && appData.siteTexts[key]) || SITE_TEXT_DEFAULTS[key] || '';
}

/* ============================================================
   STATE
============================================================ */
let session = { role:null, branchName:null, branchInfo:null, areaName:null, areaLabel:null };
/* צפייה כמשתמש (מחלקת שיווק בלבד) — לא נוגע ב-Firebase Auth/הרשאות בפועל.
   רק "מציג" את המסכים כאילו session שייך לסניף/מנהל אזור אחר, לצורך תצוגה בלבד.
   realSession שומר את הזהות האמיתית כדי לחזור אליה כשיוצאים ממצב התצוגה. */
let previewMode = null; // null | {label: string}
let realSession = null;
let ui = { view:"dashboard", adminTab:"competitions", materialFilter:"הכל", department:null, conversationOpenKey:null };

const STATUS_LABEL = {active:"פעילה", upcoming:"מתוכננת", ended:"הסתיימה"};
const PRIORITY_LABEL = {urgent:"דחוף", normal:"רגיל"};
