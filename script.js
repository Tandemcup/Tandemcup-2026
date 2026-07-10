async function loadResults(){
  try{
    const response=await fetch(`data.json?v=${Date.now()}`,{cache:'no-store'});
    if(!response.ok) throw new Error('data.json konnte nicht geladen werden');
    const data=await response.json();
    document.getElementById('last-updated').textContent=data.lastUpdated||'Noch keine Ergebnisse';
    document.getElementById('notice').textContent=data.notice||'';
    renderRows('team-body',data.teams||[],['place','team','points','weight','fish'],5);
    renderRows('angler-body',data.anglers||[],['place','angler','team','points','weight','fish'],6);
  }catch(error){
    document.getElementById('notice').textContent='Ergebnisse konnten momentan nicht geladen werden.';
    console.error(error);
  }
}
function renderRows(id,rows,fields,colspan){
  const body=document.getElementById(id);
  if(!rows.length){body.innerHTML=`<tr><td colspan="${colspan}" class="empty">Noch keine Ergebnisse eingetragen.</td></tr>`;return;}
  body.innerHTML=rows.map(row=>`<tr>${fields.map(field=>`<td>${escapeHtml(String(row[field]??''))}</td>`).join('')}</tr>`).join('');
}
function escapeHtml(value){return value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
loadResults();
setInterval(loadResults,60000);
