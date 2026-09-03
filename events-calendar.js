/* ---------- Events calendar ---------- */
const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function viewEvents(){
  markSectionRead('events');
  if(!ui.eventsView) ui.eventsView = 'list';
  const list = [...appData.events].filter(isEventVisibleToViewer).sort((a,b)=>parseHebDate(a.date)-parseHebDate(b.date));
  const groups = {};
  list.forEach(ev=>{
    const [dd,mm,yy] = ev.date.split('.');
    const key = `${yy}-${mm}`;
    if(!groups[key]) groups[key] = [];
    groups[key].push(ev);
  });
  const catIcon = {"השקה":"🚀","הדרכה":"🎓","מבצע":"🏷","תחרות":"🏆","ביקורת":"🔍","כנס":"🎤"};
  return `
    <div class="page-head">
      <h1>יומן אירועים</h1>
      <p>מועדים ואירועים חשובים לרשת — השקות, הדרכות, מבצעים ומועדי הגשה.</p>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="admin-tab ${ui.eventsView==='list'?'active':''}" onclick="setEventsView('list')">תצוגת רשימה</button>
      <button class="admin-tab ${ui.eventsView==='calendar'?'active':''}" onclick="setEventsView('calendar')">תצוגת לוח שנה</button>
    </div>
    ${ui.eventsView==='calendar' ? renderEventsCalendarGrid(list) : (Object.keys(groups).length ? Object.keys(groups).sort().map(key=>{
      const [yy,mm] = key.split('-');
      const evs = groups[key];
      return `
        <div class="cal-month-group">
          <div class="cal-month-label">${HEB_MONTHS[parseInt(mm,10)-1]} ${yy}</div>
          <div class="card">
            ${evs.map(ev=>{
              const [dd,evMM] = ev.date.split('.');
              const hasRange = ev.endDate && ev.endDate !== ev.date;
              const rangeText = hasRange ? `${ev.date} – ${ev.endDate}` : ev.date;
              let dateBoxHtml;
              if(hasRange){
                const [edd, emm] = ev.endDate.split('.');
                if(emm === evMM){
                  dateBoxHtml = `<div class="dd" style="font-size:15px;">${dd}-${edd}</div><div class="mm">${HEB_MONTHS[parseInt(evMM,10)-1].slice(0,3)}</div>`;
                } else {
                  dateBoxHtml = `<div class="dd" style="font-size:12.5px;">${dd}.${evMM}</div><div class="mm" style="font-size:10px;">עד ${edd}.${emm}</div>`;
                }
              } else {
                dateBoxHtml = `<div class="dd">${dd}</div><div class="mm">${HEB_MONTHS[parseInt(evMM,10)-1].slice(0,3)}</div>`;
              }
              return `
              <div class="cal-row">
                <div class="cal-date">${dateBoxHtml}</div>
                <div class="cal-info">
                  <div class="t">${catIcon[ev.category]||'📌'} ${ev.title} <span class="badge cat" style="margin-right:6px;">${ev.category}</span></div>
                  <div class="m" dir="ltr" style="font-size:12px;color:var(--muted);">${rangeText}</div>
                  <div class="m">${ev.desc}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('') : `
    <div class="card"><div class="empty-state">
      עדיין אין אירועים ביומן.${session.role==='marketing' ? ' לחצו על "ניהול תוכן" כדי להוסיף אירוע ראשון.' : ''}
    </div></div>`)}
  `;
}
function setEventsView(v){ ui.eventsView = v; renderContent(); }
/* ---------- לוח שנה חודשי לאירועים — כל חודש בחודשו, ימים עם אירוע מודגשים ----------
   לסניפים בלבד: שכבה נוספת של תזכורות אישיות פרטיות (יום הולדת/יום עיון/
   חופשת עובד/אחר), שנשמרות רק אצל הסניף עצמו (branchCalendarNotes). */
function calendarNoteDateKey(year, month, day){
  const dd = String(day).padStart(2,'0');
  const mm = String(month+1).padStart(2,'0');
  return `${dd}.${mm}.${year}`;
}
function notesForDateKey(dateKey){
  return (appData.branchCalendarNotes||[]).filter(n=>n.date===dateKey);
}
/* בונה קישור "הוספה ליומן Google" לתזכורת אישית - אירוע יום שלם, בלי שום
   API/הרשאה, רק URL עם פרמטרים. dateKey בפורמט DD.MM.YYYY (כמו בכל
   האפליקציה). Google מצפה ל-YYYYMMDD/YYYYMMDD (יום התחלה/יום אחרי הסיום,
   בלעדי - לכן מוסיפים יום אחד לתאריך הסיום). */
function googleCalendarAddUrl(dateKey, text, startTime, endTime){
  const [dd, mm, yyyy] = dateKey.split('.');
  function fmtDate(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}${m}${day}`;
  }
  function fmtDateTime(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0');
    return `${y}${m}${day}T${hh}${mi}00`;
  }
  let datesParam;
  if(startTime){
    const [sh,sm] = startTime.split(':').map(Number);
    const start = new Date(Number(yyyy), Number(mm)-1, Number(dd), sh, sm||0);
    let end;
    if(endTime){
      const [eh,em] = endTime.split(':').map(Number);
      end = new Date(Number(yyyy), Number(mm)-1, Number(dd), eh, em||0);
      if(end.getTime()<=start.getTime()) end = new Date(start.getTime()+3600000);
    } else {
      end = new Date(start.getTime()+3600000);
    }
    datesParam = `${fmtDateTime(start)}/${fmtDateTime(end)}`;
  } else {
    const start = new Date(Number(yyyy), Number(mm)-1, Number(dd));
    const end = new Date(start.getTime() + 86400000);
    datesParam = `${fmtDate(start)}/${fmtDate(end)}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: text,
    dates: datesParam,
    details: 'נוסף מ-NIZAT HUB'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
function renderEventsCalendarGrid(list){
  if(ui.calYear==null || ui.calMonth==null){
    const now = new Date();
    ui.calYear = now.getFullYear();
    ui.calMonth = now.getMonth();
  }
  const year = ui.calYear, month = ui.calMonth;
  const isBranch = session.role==='branch' && !!session.branchInfo;
  const catIcon = {"השקה":"🚀","הדרכה":"🎓","מבצע":"🏷","תחרות":"🏆","ביקורת":"🔍","כנס":"🎤"};
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthLabel = `${HEB_MONTHS[month]} ${year}`;

  const eventsByDay = {};
  list.forEach(ev=>{
    const startTs = parseHebDate(ev.date);
    const endTs = ev.endDate ? parseHebDate(ev.endDate) : startTs;
    if(isNaN(startTs)) return;
    for(let t=startTs; t<=endTs; t+=86400000){
      const d = new Date(t);
      if(d.getFullYear()===year && d.getMonth()===month){
        const key = d.getDate();
        if(!eventsByDay[key]) eventsByDay[key] = [];
        eventsByDay[key].push(ev);
      }
    }
  });

  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push('<div class="cal-grid-cell empty"></div>');
  for(let day=1; day<=daysInMonth; day++){
    const evs = eventsByDay[day] || [];
    const hasEvents = evs.length>0;
    const isSelected = ui.calSelectedDay===day;
    let noteHtml = '', cellStyle = '';
    if(isBranch){
      const dateKey = calendarNoteDateKey(year, month, day);
      const notes = notesForDateKey(dateKey);
      if(notes.length){
        const first = notes[0];
        const color = first.color || '#DADADA';
        cellStyle = `style="background:${color}55;border-color:${color};"`;
        const extra = notes.length>1 ? ` (+${notes.length-1})` : '';
        noteHtml = `<div style="font-size:9px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary,#222);padding:0 2px;">${first.text}${extra}</div>`;
      }
    }
    cells.push(`
      <div class="cal-grid-cell ${hasEvents?'has-event':''} ${isSelected?'selected':''}" ${cellStyle} onclick="selectCalendarDay(${day})">
        <div class="cal-grid-day">${day}</div>
        ${hasEvents ? `<div class="cal-grid-dot"></div>` : ''}
        ${noteHtml}
      </div>
    `);
  }

  const selectedEvents = ui.calSelectedDay ? (eventsByDay[ui.calSelectedDay]||[]) : [];
  const selectedDateKey = ui.calSelectedDay ? calendarNoteDateKey(year, month, ui.calSelectedDay) : null;
  const selectedNotes = (isBranch && selectedDateKey) ? notesForDateKey(selectedDateKey) : [];

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <button class="icon-btn" onclick="shiftCalendarMonth(-1)">→</button>
        <div style="font-weight:600;font-size:15.5px;">${monthLabel}</div>
        <button class="icon-btn" onclick="shiftCalendarMonth(1)">←</button>
      </div>
      <div class="cal-grid-weekdays">
        ${['א','ב','ג','ד','ה','ו','ש'].map(d=>`<div>${d}</div>`).join('')}
      </div>
      <div class="cal-grid">
        ${cells.join('')}
      </div>
      ${ui.calSelectedDay ? `
        <div style="margin-top:16px;border-top:1px solid var(--gridline);padding-top:12px;">
          <div style="font-weight:600;margin-bottom:8px;">${ui.calSelectedDay} ב${HEB_MONTHS[month]}</div>
          ${selectedEvents.length ? selectedEvents.map(ev=>`
            <div style="padding:8px 0;border-bottom:1px solid var(--gridline);">
              <div>${catIcon[ev.category]||'📌'} ${ev.title} <span class="badge cat" style="margin-right:6px;">${ev.category}</span></div>
              <div style="font-size:12.5px;color:var(--muted);margin-top:3px;">${ev.desc}</div>
            </div>
          `).join('') : (isBranch ? '' : `<div class="empty-state">אין אירועים ביום זה.</div>`)}
          ${isBranch ? `
            <div style="margin-top:${selectedEvents.length?'10px':'0'};">
              ${selectedNotes.length ? selectedNotes.map(n=>{
                const color = n.color || '#DADADA';
                return `
                <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;margin-bottom:6px;background:${color}55;">
                  <div style="flex:1;font-size:13px;">${n.text}</div>
                  <a href="${googleCalendarAddUrl(n.date, n.text)}" target="_blank" rel="noopener" class="icon-btn" style="width:auto;padding:3px 8px;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;" title="הוספה ליומן Google">📅</a>
                  <button class="icon-btn" style="width:auto;padding:3px 8px;font-size:11px;" onclick="deleteBranchCalendarNote('${n.id}')">🗑</button>
                </div>`;
              }).join('') : `<div class="empty-state" style="padding:6px 0;">אין תזכורות אישיות ביום זה.</div>`}
              <button class="icon-btn" style="width:100%;margin-top:4px;font-size:12.5px;" onclick="openBranchCalendarNoteForm('${selectedDateKey}')">+ הוספת תזכורת</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}
function shiftCalendarMonth(delta){
  ui.calMonth += delta;
  if(ui.calMonth<0){ ui.calMonth=11; ui.calYear--; }
  if(ui.calMonth>11){ ui.calMonth=0; ui.calYear++; }
  ui.calSelectedDay = null;
  renderContent();
}
function selectCalendarDay(day){
  ui.calSelectedDay = (ui.calSelectedDay===day) ? null : day;
  renderContent();
}
/* ---------- תזכורות אישיות בלוח השנה (סניף בלבד) ---------- */
function openBranchCalendarNoteForm(dateKey){
  document.getElementById('modal-body').innerHTML = `
    <h3>תזכורת ל-${dateKey}</h3>
    <div class="field"><label>טקסט</label><input id="f-note-text" placeholder="כתבו כל מה שתרצו לסמן ביום הזה..."></div>
    <div class="field">
      <label>צבע</label>
      <div id="f-note-color-picker" style="display:flex;gap:8px;">
        ${CALENDAR_NOTE_COLORS.map(function(c, i){
          return `<div data-color="${c}" onclick="selectBranchNoteColor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${i===0?'var(--text-primary,#222)':'transparent'};"></div>`;
        }).join('')}
      </div>
      <input type="hidden" id="f-note-color" value="${CALENDAR_NOTE_COLORS[0]}">
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">ביטול</button>
      <button class="btn-confirm" onclick="submitBranchCalendarNote('${dateKey}')">שמירה</button>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(()=>{ const el=document.getElementById('f-note-text'); if(el) el.focus(); }, 50);
}
function selectBranchNoteColor(color){
  document.getElementById('f-note-color').value = color;
  const picker = document.getElementById('f-note-color-picker');
  if(!picker) return;
  Array.from(picker.children).forEach(function(el){
    el.style.border = (el.getAttribute('data-color')===color) ? '2px solid var(--text-primary,#222)' : '2px solid transparent';
  });
}
function submitBranchCalendarNote(dateKey){
  const text = document.getElementById('f-note-text').value.trim();
  const color = document.getElementById('f-note-color').value || CALENDAR_NOTE_COLORS[0];
  if(!text){ toast('נא למלא טקסט'); return; }
  if(session.role!=='branch' || !session.branchInfo){ return; }
  db.collection('branchCalendarNotes').add({
    branchEmail: session.branchInfo.email,
    date: dateKey,
    color,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function(){
    closeModal();
    toast('התזכורת נוספה');
  }).catch(function(err){ toast('שגיאה: ' + err.message); });
}
function deleteBranchCalendarNote(id){
  db.collection('branchCalendarNotes').doc(id).delete()
    .then(function(){ toast('התזכורת נמחקה'); })
    .catch(function(err){ toast('שגיאה: ' + err.message); });
}
function openGoogleCalendarForNote(id){
  const note = (appData.branchCalendarNotes||[]).find(n=>n.id===id);
  if(!note) return;
  window.open(googleCalendarAddUrl(note.date, note.text), '_blank', 'noopener');
}

