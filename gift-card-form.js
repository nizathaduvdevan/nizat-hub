/* ============================================================
   טופס GIFT CARD — טופס פנימי ב-NIZAT HUB, בעיצוב האתר עצמו,
   שמחליף בהדרגה את הטופס החיצוני (Google Apps Script). השליחה
   ממשיכה להגיע לאותו Apps Script ברקע (fetch, no-cors) — כך
   ש-Google Sheets נשאר מקור האמת, בלי לגעת בקוד הישן.

   פרטי הסניף (מייל/שם) לא מוצגים כשדות בטופס — הם נלקחים
   אוטומטית מ-session, כי NIZAT HUB כבר יודע מי הסניף המחובר.
   "שם המוכר/ת" הושמט בכוונה (לא נאסף יותר) — נשלח ריק; זה שדה
   תיאורי בלבד בקוד הישן ולא חוסם שום דבר.

   דרישת קדם: יש להוסיף ל-GIFT_CARD_FORM_URL את הלינק האמיתי של
   הטופס הישן לפני שילוב זה בפועל.
   ============================================================ */

const GIFT_CARD_FORM_URL = 'https://script.google.com/a/macros/nizat.co.il/s/AKfycby6A8dMOc88OSdEkFz7M5tdBBzgyBpAWhFAr5yJDLPWa4d9em9-rkbbk5du25jLGPll1g/exec';

function viewGiftCardForm(){
  return `
    <div class="page-head">
      <h1>טופס למילוי GIFT CARD</h1>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">🧑 הלקוח/ה המזמין/ה</p>
      <div class="field">
        <label>שם מלא</label>
        <input type="text" id="gcf-ordererName">
      </div>
      <div class="field">
        <label>טלפון</label>
        <input type="tel" id="gcf-ordererPhone" inputmode="numeric">
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">🎁 מקבל/ת כרטיס המתנה</p>
      <div class="field">
        <label>שם מלא</label>
        <input type="text" id="gcf-recipientName">
      </div>
      <div class="field">
        <label>טלפון</label>
        <input type="tel" id="gcf-recipientPhone" inputmode="numeric">
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">💳 כרטיס מתנה</p>
      <p class="gcf-section-sub">האם נמסר ללקוח/ה כרטיס מתנה?</p>
      <div class="gcf-radio-group">
        <label class="gcf-radio-option">
          <input type="radio" name="gcf-hasCard" value="כן" onchange="gcfToggleCardNumber(true)">
          <span>כן, נמסר ללקוח/ה כרטיס מתנה</span>
        </label>
        <div class="gcf-conditional" id="gcf-cardNumber-wrap" style="display:none;">
          <label>מה מספר הכרטיס הקיים?</label>
          <input type="text" id="gcf-cardNumber" inputmode="numeric">
        </div>
        <label class="gcf-radio-option">
          <input type="radio" name="gcf-hasCard" value="לא" onchange="gcfToggleCardNumber(false)" checked>
          <span>לא, יש להפיק כרטיס חדש</span>
        </label>
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">💰 סכום וברכה</p>
      <div class="field">
        <label>סכום הטעינה (₪)</label>
        <input type="text" id="gcf-amount" inputmode="numeric">
      </div>
      <div class="field">
        <label>ברכה או מסר (לא חובה)</label>
        <textarea id="gcf-message" rows="3"></textarea>
      </div>
    </div>

    <div class="gcf-section">
      <p class="gcf-section-title">🧾 פרטי קבלה</p>
      <div class="gcf-receipt-grid">
        <div class="field"><label>קבלה</label><input type="text" id="gcf-receiptNumber" inputmode="numeric"></div>
        <div class="field"><label>קופה</label><input type="text" id="gcf-cashierNumber" inputmode="numeric"></div>
        <div class="field"><label>סניף</label><input type="text" id="gcf-branchNumber" inputmode="numeric"></div>
      </div>
    </div>

    <div id="gcf-error" class="field-error" style="display:none;"></div>

    <button type="button" class="btn-primary" id="gcf-submit-btn" onclick="submitGiftCardForm()">שלח/י טופס להטענה</button>
  `;
}

/* מציג/מסתיר את שדה "מספר כרטיס קיים" לפי הבחירה ברדיו. */
function gcfToggleCardNumber(show){
  const wrap = document.getElementById('gcf-cardNumber-wrap');
  if(wrap) wrap.style.display = show ? 'block' : 'none';
}
