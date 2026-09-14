/* ============================================================
   AI CHAT — מסך "ידע ונהלים", עוזר ה-AI של NIZAT HUB
   ------------------------------------------------------------
   קובץ עצמאי לחלוטין. מדבר ישירות מול ה-Worker הקיים
   (nizat-hub-ai.ai-1c0.workers.dev), בלי לגעת בשום קובץ אחר
   מלבד שורת ניתוב אחת ב-navigation.js וכרטיס אחד ב-dashboard.js.
   משתמש רק בפונקציות עזר קיימות (esc, icon, toast) מ-ui-utils.js —
   לא מוסיף שום מחלקת CSS חדשה לקובץ עיצוב, רק inline style
   למה שבאמת חדש (בועות הצ'אט).
   ============================================================ */
const AI_CHAT_ENDPOINT = 'https://nizat-hub-ai.ai-1c0.workers.dev/ask';

/* מצב הצ'אט חי רק בזיכרון הדפדפן (לא נשמר ב-Firestore) — מתאפס
   כשעוזבים את המסך או מרעננים. זו התחלה מינימלית; אם בהמשך תרצו
   היסטוריה שנשמרת, זה שינוי נפרד ומודע. */
let aiChatMessages = []; // {role:'user'|'bot', text, department, source, error}
let aiChatLoading = false;

function aiChatKeyDown(ev){
  if(ev.key==='Enter' && !ev.shiftKey){
    ev.preventDefault();
    aiChatSend();
  }
}

function aiChatScrollToBottom(){
  requestAnimationFrame(function(){
    const wrap = document.getElementById('ai-chat-messages');
    if(wrap) wrap.scrollTop = wrap.scrollHeight;
  });
}

function aiChatSend(){
  const inputEl = document.getElementById('ai-chat-input');
  if(!inputEl || aiChatLoading) return;
  const question = inputEl.value.trim();
  if(!question) return;

  aiChatMessages.push({role:'user', text:question});
  aiChatLoading = true;
  renderContent();
  aiChatScrollToBottom();
  const freshInput = document.getElementById('ai-chat-input');
  if(freshInput) freshInput.focus();

  fetch(AI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({question})
  })
    .then(function(res){ return res.json(); })
    .then(function(data){
      if(data && data.ok){
        aiChatMessages.push({
          role: 'bot',
          text: data.answer || 'לא התקבלה תשובה מהעוזר.',
          department: data.department || null,
          source: data.source || null,
          found: !!data.found
        });
      } else {
        aiChatMessages.push({
          role: 'bot',
          text: (data && data.error) || 'אירעה שגיאה בפנייה לעוזר ה-AI.',
          error: true
        });
      }
    })
    .catch(function(err){
      console.error('AI chat request failed:', err);
      aiChatMessages.push({
        role: 'bot',
        text: 'לא הצלחתי להתחבר לעוזר ה-AI כרגע. נסו שוב בעוד רגע.',
        error: true
      });
    })
    .finally(function(){
      aiChatLoading = false;
      renderContent();
      aiChatScrollToBottom();
    });
}

function aiChatClear(){
  aiChatMessages = [];
  renderContent();
}

function aiChatBubble(m){
  const isUser = m.role === 'user';
  const bg = isUser ? 'var(--brand, #457a1f)' : (m.error ? '#fdeaea' : 'var(--surface-2, #f0f0f0)');
  const color = isUser ? '#fff' : (m.error ? '#8a2d2d' : 'var(--text-primary, #222)');
  const align = isUser ? 'flex-end' : 'flex-start';
  const radius = isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px';
  let meta = '';
  if(!isUser && !m.error && (m.department || m.source)){
    meta = `<div style="margin-top:6px;font-size:11.5px;opacity:0.75;">${m.department ? esc(m.department) : ''}${m.department && m.source ? ' · ' : ''}${m.source ? esc(m.source) : ''}</div>`;
  }
  return `
    <div style="display:flex;justify-content:${align};margin:6px 0;">
      <div style="max-width:82%;padding:10px 14px;border-radius:${radius};background:${bg};color:${color};font-size:14.5px;line-height:1.6;white-space:pre-wrap;">
        ${esc(m.text)}
        ${meta}
      </div>
    </div>
  `;
}

function viewAiChat(){
  return `
    <div class="page-head">
      <h1>ידע ונהלים</h1>
      <p style="color:var(--muted);">שאלו כל שאלה על נהלים ומידע של NIZAT HUB. התשובות מבוססות אך ורק על מאגר הידע המאושר.</p>
    </div>

    <div class="card" style="display:flex;flex-direction:column;padding:0;overflow:hidden;">
      <div id="ai-chat-messages" style="flex:1;min-height:320px;max-height:55vh;overflow-y:auto;padding:16px;">
        ${aiChatMessages.length ? aiChatMessages.map(aiChatBubble).join('') : `
          <div class="empty-state">שאלו אותי כל שאלה — למשל על נהלים, מוצרים או תהליכים ב-NIZAT HUB.</div>
        `}
        ${aiChatLoading ? `
          <div style="display:flex;justify-content:flex-start;margin:6px 0;">
            <div style="padding:10px 14px;border-radius:14px 14px 14px 4px;background:var(--surface-2, #f0f0f0);font-size:14.5px;">כותב תשובה…</div>
          </div>
        ` : ''}
      </div>
      <div style="display:flex;gap:8px;padding:12px;border-top:1px solid var(--border, #e5e5e5);">
        <input id="ai-chat-input" type="text" placeholder="הקלידו שאלה..." autocomplete="off"
          style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--border, #ccc);font-size:14.5px;"
          onkeydown="aiChatKeyDown(event)" ${aiChatLoading ? 'disabled' : ''} />
        <button type="button" class="btn-secondary" onclick="aiChatSend()" ${aiChatLoading ? 'disabled' : ''}>שליחה</button>
      </div>
    </div>

    ${aiChatMessages.length ? `
      <div style="text-align:center;margin-top:10px;">
        <button type="button" class="link-btn" onclick="aiChatClear()">שיחה חדשה</button>
      </div>
    ` : ''}
  `;
}
