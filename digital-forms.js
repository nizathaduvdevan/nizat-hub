/* ============================================================
   טפסים דיגיטליים — מסך רשימה שמפנה לשני מסכי טפסים פנימיים
   ב-NIZAT HUB (viewGiftCardForm ב-gift-card-form.js, ו-
   viewManagerCardForm ב-manager-card-form.js). שני הטפסים שולחים
   ברקע (fetch, no-cors) לאותם Google Apps Script קיימים, כך
   ש-Google Sheets נשאר מקור האמת — הקובץ הזה עצמו סטטי טהור,
   בלי appData/Firestore.

   היסטוריה: בשלב קודם כרטיסי מנהלים הוצג כ-iframe ממוזער של
   הטופס החיצוני (עדיין לא רספונסיבי). זה הוחלף במסך native מלא —
   אין יותר iframe/scale/accordion בקובץ הזה.
   ============================================================ */

const DIGITAL_FORMS = {
  giftCard: {
    title: 'טופס למילוי GIFT CARD',
    icon: '🎁'
  },
  managerCard: {
    title: 'טופס הזמנת כרטיס מנהלים',
    icon: '💳'
  }
};

function viewDigitalForms(){
  return `
    <div class="page-head">
      <h1>טפסים דיגיטליים</h1>
    </div>
    <div class="df-list">
      <button type="button" class="df-item" onclick="goTo('giftCardForm')">
        <span class="df-item-icon" aria-hidden="true">${DIGITAL_FORMS.giftCard.icon}</span>
        <span class="df-item-title">${DIGITAL_FORMS.giftCard.title}</span>
        <span class="df-item-arrow" aria-hidden="true">‹</span>
      </button>

      <button type="button" class="df-item" onclick="goTo('managerCardForm')">
        <span class="df-item-icon" aria-hidden="true">${DIGITAL_FORMS.managerCard.icon}</span>
        <span class="df-item-title">${DIGITAL_FORMS.managerCard.title}</span>
        <span class="df-item-arrow" aria-hidden="true">‹</span>
      </button>
    </div>
  `;
}
