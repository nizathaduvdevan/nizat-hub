/* ============================================================
   טפסים דיגיטליים — מסך רשימה שמפנה לשני טפסי Google Apps Script
   עצמאיים שכבר קיימים ורצים (כרטיס מתנה / כרטיסי מנהלים). אין כאן
   שום appData/Firestore — זה מסך סטטי טהור, לא נוגע בשום קובץ אחר.

   טופס כרטיס מתנה כבר רספונסיבי (יש לו @media breakpoint פנימי
   בקוד שלו) — נפתח כקישור רגיל באותו חלון, בדיוק כמו כפתור Google
   Calendar ב-my-calendar.js (<a href>, בלי target="_blank", כי PWA
   במובייל חוסם window.open).

   טופס כרטיסי מנהלים אינו רספונסיבי — מוטמע כ-iframe וממוזער עם
   CSS transform:scale() כדי להתאים לרוחב מסך נייד, בלי לגעת בקוד
   הטופס עצמו. NATURAL_WIDTH הוא הרוחב המשוער (בפיקסלים) של תוכן
   הטופס במסך רחב, ו-NATURAL_HEIGHT הערכת גובה. שני המספרים האלה
   הם הערכה ראשונית בלבד — יש לכוונן אותם ידנית לאחר בדיקה אמיתית
   במכשיר נייד (זו הדרך היחידה למדוד, כי לא ניתן לקרוא רוחב/גובה
   בפועל מתוך iframe ממקור אחר — חסימת same-origin בין script.google.com
   ל-NIZAT HUB).

   דרישת קדם ב-Apps Script של טופס כרטיסי מנהלים (לא ב-NIZAT HUB):
   יש להוסיף ל-doGet() את:
     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
   בלי זה גוגל חוסמת את הטעינה ב-iframe (refused to connect).
   יש לפרוס דרך "Manage deployments" → עריכת ה-deployment הקיים →
   New version, לא "New deployment", כדי שה-URL הקיים לא ישתנה.
   ============================================================ */

const DIGITAL_FORMS = {
  giftCard: {
    title: 'טופס למילוי GIFT CARD',
    icon: '🎁',
    url: 'https://script.google.com/a/macros/nizat.co.il/s/AKfycby6A8dMOc88OSdEkFz7M5tdBBzgyBpAWhFAr5yJDLPWa4d9em9-rkbbk5du25jLGPll1g/exec',
    mode: 'link'
  },
  managerCard: {
    title: 'טופס הזמנת כרטיס מנהלים',
    icon: '💳',
    url: 'https://script.google.com/a/macros/nizat.co.il/s/AKfycbwkt83XK3YdKzeQwcFZ7GKTDTr6nt5YP1dk9MkbtgmfV0wApWZqrzRO7sbyNpQcdtZMzw/exec',
    mode: 'iframe',
    naturalWidth: 1000,   // הערכה — לכוונן לפי בדיקה אמיתית במובייל
    naturalHeight: 1500   // הערכה — לכוונן לפי בדיקה אמיתית במובייל
  }
};

function viewDigitalForms(){
  return `
    <div class="page-head">
      <h1>טפסים דיגיטליים</h1>
    </div>
    <div class="df-list">
      <a class="df-item" href="${DIGITAL_FORMS.giftCard.url}">
        <span class="df-item-icon" aria-hidden="true">${DIGITAL_FORMS.giftCard.icon}</span>
        <span class="df-item-title">${DIGITAL_FORMS.giftCard.title}</span>
        <span class="df-item-arrow" aria-hidden="true">↗</span>
      </a>

      <button type="button" class="df-item" onclick="toggleDigitalForm('managerCard')" id="df-toggle-managerCard" aria-expanded="false">
        <span class="df-item-icon" aria-hidden="true">${DIGITAL_FORMS.managerCard.icon}</span>
        <span class="df-item-title">${DIGITAL_FORMS.managerCard.title}</span>
        <span class="df-item-arrow" aria-hidden="true">⌄</span>
      </button>
      <div class="df-iframe-wrap" id="df-frame-managerCard"></div>
    </div>
  `;
}

/* פותח/סוגר את ה-iframe הממוזער בלחיצה על כרטיס "כרטיסי מנהלים".
   ה-iframe נבנה רק בלחיצה הראשונה (lazy) כדי לא לטעון תוכן חיצוני
   בלי צורך. scale מחושב מרוחב הקונטיינר בפועל חלקי naturalWidth,
   כך שזה מסתגל לרוחב מסכים שונים (לא רק לרוחב אחד קבוע). overflow:auto
   על העטיפה משמש גיבוי אם naturalHeight המשוער נמוך מדי בפועל. */
function toggleDigitalForm(key){
  const cfg = DIGITAL_FORMS[key];
  const wrap = document.getElementById('df-frame-'+key);
  const btn = document.getElementById('df-toggle-'+key);
  if(!wrap || !btn) return;

  const isOpen = wrap.classList.contains('open');
  if(isOpen){
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
    return;
  }

  if(!wrap.dataset.built){
    const scale = wrap.clientWidth / cfg.naturalWidth;
    wrap.innerHTML = `<iframe src="${cfg.url}" style="width:${cfg.naturalWidth}px;height:${cfg.naturalHeight}px;border:none;transform:scale(${scale});transform-origin:top right;"></iframe>`;
    wrap.style.height = Math.round(cfg.naturalHeight*scale)+'px';
    wrap.dataset.built = '1';
  }
  wrap.classList.add('open');
  btn.setAttribute('aria-expanded','true');
}
