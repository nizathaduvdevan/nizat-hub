/* ============================================================
   טופס הזמנת כרטיס מנהלים — טופס פנימי ב-NIZAT HUB, בעיצוב האתר
   עצמו, שמחליף בהדרגה את הטופס החיצוני (Google Apps Script).
   השליחה ממשיכה להגיע לאותו Apps Script ברקע (fetch, no-cors) —
   דרך הענף החדש שנוסף ל-doGet ב-Main.gs, שקורא לאותה
   submitManagerCardRequest() שהטופס המקורי כבר משתמש בה.

   הוולידציה כאן במכוון מחמירה ותואמת בדיוק את הכללים ב-
   Validation.gs (validateAndNormalize_), כי אין דרך לקרוא שגיאת
   שרת חזרה במצב no-cors — כל שגיאה שהשרת עלול לזרוק חייבת
   להיתפס כאן קודם, אחרת השליחה תיכשל בשקט.

   שם הסניף ומייל הסניף לא מוצגים כשדות — נלקחים מ-session,
   בדיוק כמו בטופס GIFT CARD.
   ============================================================ */

const MANAGER_CARD_FORM_URL = 'https://script.google.com/a/macros/nizat.co.il/s/AKfycbwkt83XK3YdKzeQwcFZ7GKTDTr6nt5YP1dk9MkbtgmfV0wApWZqrzRO7sbyNpQcdtZMzw/exec';
const MANAGER_CARD_ROLES = ['מנהל/ת סניף', 'מנהל/ת משמרת'];

function viewManagerCardForm(){
  return `
    <div class="page-head">
      <h1>טופס הזמנת כרטיס מנהלים</h1>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">🏬 פרטי המזמין/ה</p>
      <div class="field">
        <label>שם מזמין/ת הכרטיס</label>
        <input type="text" id="mcf-requesterName">
      </div>
      <div class="field">
        <label>מספר הסניף</label>
        <input type="text" id="mcf-branchNumber" inputmode="numeric">
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">🧑 בעל/ת הכרטיס</p>
      <div class="field">
        <label>שם מלא</label>
        <input type="text" id="mcf-recipientName">
      </div>
      <div class="field">
        <label>מספר עובד</label>
        <input type="text" id="mcf-employeeNumber" inputmode="numeric">
      </div>
      <div class="field">
        <label>מספר ת"ז</label>
        <input type="text" id="mcf-idNumber" inputmode="numeric" maxlength="9">
      </div>
      <div class="field">
        <label>מספר נייד</label>
        <input type="tel" id="mcf-mobile" inputmode="tel">
      </div>
      <div class="field">
        <label>כתובת מגורים</label>
        <input type="text" id="mcf-homeAddress">
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">💳 כרטיס מנהל</p>
      <p class="gcf-section-sub">האם יש ברשות בעל/ת הכרטיס כרטיס מנהל זמין?</p>
      <div class="gcf-radio-group">
        <label class="gcf-radio-option">
          <input type="radio" name="mcf-hasCard" value="yes" onchange="mcfToggleCardNumber(true)">
          <span>כן, יש ברשותי כרטיס זמין</span>
        </label>
        <div class="gcf-conditional" id="mcf-cardNumber-wrap" style="display:none;">
          <label>מה מספר הכרטיס הקיים?</label>
          <input type="text" id="mcf-cardNumber" inputmode="numeric">
        </div>
        <label class="gcf-radio-option">
          <input type="radio" name="mcf-hasCard" value="no" onchange="mcfToggleCardNumber(false)" checked>
          <span>לא, שלחו לי כרטיס חדש</span>
        </label>
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">💼 תפקיד</p>
      <div class="field">
        <label>תפקיד בעל/ת הכרטיס</label>
        <select id="mcf-role">
          <option value="" selected disabled>בחרו תפקיד</option>
          ${MANAGER_CARD_ROLES.map(r=>`<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>
    </div>

    <div id="mcf-error" class="field-error" style="display:none;"></div>

    <button type="button" class="btn-primary" id="mcf-submit-btn" onclick="submitManagerCardFormNizatHub()">שלח/י בקשה</button>
  `;
}

function mcfToggleCardNumber(show){
  const wrap = document.getElementById('mcf-cardNumber-wrap');
  if(wrap) wrap.style.display = show ? 'block' : 'none';
}

function mcfShowError(msg){
  const el = document.getElementById('mcf-error');
  if(!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({behavior:'smooth', block:'center'});
}
function mcfClearError(){
  const el = document.getElementById('mcf-error');
  if(el) el.style.display = 'none';
}

async function submitManagerCardFormNizatHub(){
  mcfClearError();

  const val = id => (document.getElementById(id)||{}).value?.trim() || '';
  const requesterName = val('mcf-requesterName');
  const branchNumber = val('mcf-branchNumber');
  const recipientName = val('mcf-recipientName');
  const employeeNumber = val('mcf-employeeNumber');
  const idNumber = val('mcf-idNumber');
  const mobile = val('mcf-mobile');
  const homeAddress = val('mcf-homeAddress');
  const hasCardEl = document.querySelector('input[name="mcf-hasCard"]:checked');
  const hasCard = hasCardEl ? hasCardEl.value : 'no';
  const cardNumber = hasCard === 'yes' ? val('mcf-cardNumber') : '';
  const role = val('mcf-role');

  const branchName = session.branchName || '';
  const requesterEmail = (session.branchInfo && session.branchInfo.email) || '';

  /* וולידציה — משוכפלת בכוונה מ-validateAndNormalize_ ב-Validation.gs,
     כי fetch במצב no-cors לא מאפשר לקרוא שגיאת שרת בחזרה. כל כלל כאן
     חייב להישאר תואם לקובץ ההוא אם הוא ישתנה בעתיד. */
  if(!requesterName || !branchNumber || !recipientName || !employeeNumber ||
     !idNumber || !mobile || !homeAddress || !role){
    mcfShowError('נא למלא את כל שדות החובה.');
    return;
  }
  if(!requesterEmail || !branchName){
    mcfShowError('לא נמצאו פרטי סניף מחוברים. נסו להתחבר מחדש.');
    return;
  }
  if(!/^\d{1,10}$/.test(branchNumber)){
    mcfShowError('מספר הסניף חייב להכיל ספרות בלבד.');
    return;
  }
  if(!/^\d{9}$/.test(idNumber)){
    mcfShowError('מספר ת"ז חייב להכיל 9 ספרות בדיוק.');
    return;
  }
  if(!/^[\d+\-\s()]{9,20}$/.test(mobile)){
    mcfShowError('מספר הנייד אינו תקין.');
    return;
  }
  if(hasCard === 'yes' && !cardNumber){
    mcfShowError('נא להזין את מספר הכרטיס הקיים, או לבחור "שלחו לי כרטיס חדש".');
    return;
  }
  if(MANAGER_CARD_ROLES.indexOf(role) === -1){
    mcfShowError('נא לבחור תפקיד מהרשימה.');
    return;
  }

  const params = {
    requesterName, requesterEmail, branchName, branchNumber,
    recipientName, employeeNumber, idNumber, mobile, homeAddress,
    hasCard, cardNumber, role
  };
  const query = Object.entries(params)
    .map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v))
    .join('&');

  const btn = document.getElementById('mcf-submit-btn');
  btn.disabled = true;
  btn.textContent = 'שולח...';

  try{
    await fetch(MANAGER_CARD_FORM_URL + '?' + query, {mode:'no-cors'});
    toast('הבקשה נשלחה בהצלחה');
    goTo('digitalForms');
  }catch(err){
    mcfShowError('לא הצלחנו לשלוח את הבקשה. בדקו את החיבור לאינטרנט ונסו שוב.');
    btn.disabled = false;
    btn.textContent = 'שלח/י בקשה';
  }
}
