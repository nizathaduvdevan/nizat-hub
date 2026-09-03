/* ---------- Global search ---------- */
const SEARCH_ICON = {competitions:'🏆', instructions:'📋', materials:'⬇', events:'🗓'};
/* פותח/סוגר את תיבת החיפוש כשכבה מלאה על המסך בנייד (בדסקטופ היא כבר תמיד
   גלויה בסרגל העליון, אז הפונקציה הזו רלוונטית רק שם). */
function toggleMobileSearch(){
  const wrap = document.getElementById('search-wrap');
  const opening = !wrap.classList.contains('mobile-search-open');
  wrap.classList.toggle('mobile-search-open');
  if(opening){
    setTimeout(()=>document.getElementById('global-search').focus(), 50);
  } else {
    document.getElementById('global-search').value = '';
    document.getElementById('search-results').classList.remove('open');
  }
}
function onSearch(q){
  const resultsEl = document.getElementById('search-results');
  q = q.trim();
  if(!q){ resultsEl.classList.remove('open'); resultsEl.innerHTML=''; return; }
  const needle = q.toLowerCase();
  let results = [];
  appData.competitions.forEach(c=>{ if((c.title+c.category).toLowerCase().includes(needle)) results.push({type:'competitions', label:c.title, meta:'תחרות · '+STATUS_LABEL[c.status]}); });
  appData.instructions.forEach(i=>{ if((i.title+i.category).toLowerCase().includes(needle)) results.push({type:'instructions', label:i.title, meta:'הוראה · '+i.category}); });
  appData.materials.forEach(m=>{ if((m.name+m.category).toLowerCase().includes(needle)) results.push({type:'materials', label:m.name, meta:'חומר · '+m.category}); });
  appData.events.filter(isEventVisibleToViewer).forEach(e=>{ if((e.title+e.category).toLowerCase().includes(needle)) results.push({type:'events', label:e.title, meta:'אירוע · '+e.date}); });
  results = results.slice(0,8);
  resultsEl.innerHTML = results.length ? results.map(r=>`
      <div class="search-result-item" onclick="goToSearchResult('${r.type}')">
        <span style="font-size:15px;">${SEARCH_ICON[r.type]}</span>
        <div><div class="srt">${r.label}</div><div class="srm">${r.meta}</div></div>
      </div>`).join('')
    : `<div class="search-empty">לא נמצאו תוצאות עבור "${q}"</div>`;
  resultsEl.classList.add('open');
}
function goToSearchResult(type){
  document.getElementById('search-results').classList.remove('open');
  document.getElementById('global-search').value = '';
  document.getElementById('search-wrap').classList.remove('mobile-search-open');
  goTo(type);
}

