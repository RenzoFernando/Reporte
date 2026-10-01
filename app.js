const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DAYS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const STORAGE_KEY = "reporteQuincenalV1";

const $ = (id) => document.getElementById(id);
let state = { entries: [], aidDaysManual: false };

function bogotaTodayISO() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(p.map(x => [x.type, x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function parseISO(s) { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); }
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthEnd(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }
function getPeriod() {
  const y = Number($("year").value); const m = Number($("month").value); const h = Number($("half").value);
  return { y, m, h, start: h===1 ? 1 : 16, end: h===1 ? 15 : monthEnd(y,m) };
}
function periodText() { const p = getPeriod(); return `${p.start} de ${MONTHS[p.m]} al ${p.end} de ${MONTHS[p.m]} de ${p.y}`; }
function withinPeriod(iso) { const d = parseISO(iso), p=getPeriod(); return d.getFullYear()===p.y && d.getMonth()===p.m && d.getDate()>=p.start && d.getDate()<=p.end; }
function fmtDateEs(iso) { const d=parseISO(iso); return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; }
function fmtShortDate(iso) { const d=parseISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function fmtTime(v) { if (!v) return ""; const [h,m]=v.split(":").map(Number); const ap=h>=12?"p. m.":"a. m."; const hh=((h+11)%12)+1; return `${hh}:${String(m).padStart(2,"0")} ${ap}`; }
function timeDecimal(v) { const [h,m]=v.split(":").map(Number); return h + m/60; }
function metrics(e) { let a=timeDecimal(e.start), b=timeDecimal(e.end); if (b<a) b+=24; const presence=Math.max(0,b-a); const lunch=Number(e.lunch)||0; return { presence, net: Math.max(0,presence-lunch) }; }
function fmtHours(n) { return Number(n).toFixed(Number.isInteger(n)?0:2).replace(/\.00$/,""); }
function fmtMoney(n) { return new Intl.NumberFormat("es-CO", { style:"currency", currency:"COP", maximumFractionDigits:0 }).format(Number(n)||0); }
function mondayOf(d) { const x=new Date(d); const day=x.getDay(); x.setDate(x.getDate() - (day===0?6:day-1)); x.setHours(0,0,0,0); return x; }
function sundayOf(d) { const x=mondayOf(d); x.setDate(x.getDate()+6); return x; }
function groupWeeks(entries) {
  const groups = new Map();
  for (const e of [...entries].sort((a,b)=>a.date.localeCompare(b.date))) {
    const mon = mondayOf(parseISO(e.date)); const key=isoDate(mon);
    if (!groups.has(key)) groups.set(key, { start: mon, end: sundayOf(mon), entries: [] });
    groups.get(key).entries.push(e);
  }
  return [...groups.values()].sort((a,b)=>a.start-b.start);
}
function daysWorked() { return new Set(state.entries.map(e=>e.date)).size; }
function totalNet() { return state.entries.reduce((s,e)=>s+metrics(e).net,0); }
function totalTransport() { return state.entries.reduce((s,e)=>s+(Number(e.transport)||0),0); }
function signatureName() { return $("workerName").value.trim(); }
function safeFilenameBase() { const p=getPeriod(); return `Reporte_Tiempo_${p.h}Q_${MONTHS[p.m]}_${p.y}`.replace(/\s+/g,"_"); }

function init() {
  MONTHS.forEach((m,i)=>$("month").insertAdjacentHTML("beforeend", `<option value="${i}">${m[0].toUpperCase()+m.slice(1)}</option>`));
  const today = parseISO(bogotaTodayISO());
  $("year").value=today.getFullYear(); $("month").value=today.getMonth(); $("half").value=today.getDate()<=15?"1":"2"; $("documentDate").value=bogotaTodayISO();
  load(); bind(); refreshPeriod(); render();
}
function bind() {
  ["workerName","workerId","workerRole","documentDate","year","month","half","employerTransportPct"].forEach(id => $(id).addEventListener("change", ()=>{ if (["year","month","half"].includes(id)) refreshPeriod(true); save(); render(); }));
  $("aidDays").addEventListener("input", ()=>{ state.aidDaysManual=true; save(); renderSummary(); });
  $("addEntryBtn").addEventListener("click", addEntry);
  $("downloadExcelBtn").addEventListener("click", generateExcel);
  $("downloadPdfBtn").addEventListener("click", generatePdf);
  $("newPeriodBtn").addEventListener("click", newPeriod);
  $("resetAllBtn").addEventListener("click", resetAll);
  $("exportBackupBtn").addEventListener("click", exportBackup);
  $("importBackupInput").addEventListener("change", importBackup);
}
function currentSnapshot() {
  return {
    workerName: $("workerName").value, workerId: $("workerId").value, workerRole: $("workerRole").value,
    documentDate: $("documentDate").value, year: $("year").value, month: $("month").value, half: $("half").value,
    employerTransportPct: $("employerTransportPct").value, aidDays: $("aidDays").value,
    aidDaysManual: state.aidDaysManual, entries: state.entries
  };
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSnapshot())); $("saveStatus").textContent="Guardado local automático ✓"; }
function load() {
  const raw=localStorage.getItem(STORAGE_KEY); if (!raw) return;
  try { const s=JSON.parse(raw); ["workerName","workerId","workerRole","documentDate","year","month","half","employerTransportPct"].forEach(id=>{ if (s[id]!==undefined) $(id).value=s[id]; }); state.entries=Array.isArray(s.entries)?s.entries:[]; state.aidDaysManual=!!s.aidDaysManual; if (s.aidDays!==undefined) $("aidDays").value=s.aidDays; } catch {}
}
function refreshPeriod(prune=false) {
  $("periodText").value=periodText(); const p=getPeriod(); $("workDate").min=`${p.y}-${String(p.m+1).padStart(2,"0")}-${String(p.start).padStart(2,"0")}`; $("workDate").max=`${p.y}-${String(p.m+1).padStart(2,"0")}-${String(p.end).padStart(2,"0")}`;
  if (!withinPeriod($("workDate").value||"1900-01-01")) $("workDate").value=$("workDate").min;
  if (prune && state.entries.some(e=>!withinPeriod(e.date))) state.entries=[];
}
function addEntry() {
  const date=$("workDate").value, start=$("startTime").value, end=$("endTime").value, project=$("project").value.trim();
  $("entryError").textContent="";
  if (!date || !start || !end) { $("entryError").textContent="Fecha, hora de ingreso y hora de salida son obligatorias."; return; }
  if (!withinPeriod(date)) { $("entryError").textContent="La fecha no pertenece a la quincena seleccionada."; return; }
  const entry={ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()), date, start, end, lunch:Number($("lunchHours").value)||0, project, transport:Number($("transport").value)||0 };
  const m=metrics(entry); if (m.net<0 || m.presence===0) { $("entryError").textContent="Revisa las horas: la permanencia debe ser mayor que cero."; return; }
  state.entries.push(entry); state.entries.sort((a,b)=>a.date.localeCompare(b.date));
  $("project").value=""; if (!state.aidDaysManual) $("aidDays").value=daysWorked(); save(); render();
}
function deleteEntry(id) { state.entries=state.entries.filter(e=>e.id!==id); if (!state.aidDaysManual) $("aidDays").value=daysWorked(); save(); render(); }
function render() {
  refreshPeriod(false); const body=$("entriesBody"); body.innerHTML=""; const groups=groupWeeks(state.entries); let wi=0;
  for (const g of groups) {
    wi++; const p=getPeriod(); const start=new Date(Math.max(g.start, new Date(p.y,p.m,p.start))); const end=new Date(Math.min(g.end, new Date(p.y,p.m,p.end)));
    body.insertAdjacentHTML("beforeend", `<tr class="week-row"><td colspan="9">SEMANA ${wi} · ${start.getDate()}–${end.getDate()} ${MONTHS[p.m]}</td></tr>`);
    for (const e of g.entries) { const m=metrics(e); body.insertAdjacentHTML("beforeend", `<tr><td>${fmtDateEs(e.date)}</td><td>${fmtTime(e.start)}</td><td>${fmtTime(e.end)}</td><td>${fmtHours(m.presence)} h</td><td class="lunch-cell">${fmtHours(e.lunch)} h</td><td class="net-hours">${fmtHours(m.net)} h</td><td>${escapeHtml(e.project||"—")}</td><td class="money">${fmtMoney(e.transport)}</td><td><button class="delete-btn" data-id="${e.id}">Eliminar</button></td></tr>`); }
  }
  body.querySelectorAll(".delete-btn").forEach(b=>b.addEventListener("click",()=>deleteEntry(b.dataset.id)));
  $("emptyState").style.display=state.entries.length?"none":"block";
  $("daysPill").textContent=`${daysWorked()} día${daysWorked()===1?"":"s"}`; $("hoursPill").textContent=`${fmtHours(totalNet())} h`;
  const projects=[...new Set(state.entries.map(e=>e.project).filter(Boolean))]; $("projectList").innerHTML=projects.map(p=>`<option value="${escapeAttr(p)}"></option>`).join("");
  if (!state.aidDaysManual || $("aidDays").value==="") $("aidDays").value=daysWorked(); renderSummary();
}
function renderSummary() {
  const t=totalTransport(), pct=(Number($("employerTransportPct").value)||0)/100; $("transportTotal").value=fmtMoney(t); $("employerTransportTotal").value=fmtMoney(t*pct);
  $("notePreview").innerHTML=`<strong>Nota automática:</strong> Las horas laboradas se calculan como permanencia menos el tiempo de almuerzo registrado. Total: <strong>${fmtHours(totalNet())} horas</strong>. Auxilio diario pactado por <strong>${Number($("aidDays").value)||0} días</strong>.`;
}
function newPeriod() { if (!confirm("Se eliminarán las jornadas actuales, pero se conservarán los datos del trabajador. ¿Continuar?")) return; state.entries=[]; state.aidDaysManual=false; $("aidDays").value=0; save(); render(); }
function resetAll() { if (!confirm("Esto borra todos los datos guardados en este navegador. ¿Continuar?")) return; localStorage.removeItem(STORAGE_KEY); location.reload(); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function escapeAttr(s){ return escapeHtml(s); }

function validateForExport() { if (!state.entries.length) { alert("Agrega al menos una jornada antes de generar el reporte."); return false; } return true; }
function excelTime(v) { const [h,m]=v.split(":").map(Number); return (h*60+m)/1440; }
function excelDate(iso) { const [y,m,d]=iso.split("-").map(Number); return new Date(y,m-1,d); }
function applyBorders(cell) { cell.border={ top:{style:"thin",color:{argb:"FFB9C2CC"}}, left:{style:"thin",color:{argb:"FFB9C2CC"}}, bottom:{style:"thin",color:{argb:"FFB9C2CC"}}, right:{style:"thin",color:{argb:"FFB9C2CC"}} }; }

async function generateExcel() {
  if (!validateForExport()) return;
  const wb=new ExcelJS.Workbook(); wb.creator="Reporte quincenal"; wb.created=new Date();
  const ws=wb.addWorksheet("Reporte", { pageSetup:{ paperSize:9, orientation:"portrait", fitToPage:true, fitToWidth:1, fitToHeight:1, margins:{left:.25,right:.25,top:.35,bottom:.35,header:.1,footer:.1} } });
  ws.views=[{showGridLines:false}]; ws.columns=[{width:25},{width:12},{width:12},{width:13},{width:11},{width:14},{width:25},{width:15}];
  ws.mergeCells("A1:H1"); const title=ws.getCell("A1"); title.value="REPORTE DE TIEMPO LABORADO"; title.font={bold:true,size:16,color:{argb:"FF172033"}}; title.alignment={horizontal:"center"}; ws.getRow(1).height=25;
  const meta=[["NOMBRE:",$("workerName").value],["CÉDULA:",$("workerId").value],["CARGO:",$("workerRole").value],["QUINCENA:",periodText()]];
  meta.forEach((r,i)=>{ const row=3+i; ws.getCell(row,1).value=r[0]; ws.getCell(row,1).font={bold:true}; ws.mergeCells(row,2,row,8); ws.getCell(row,2).value=r[1]; ws.getCell(row,2).border={bottom:{style:"thin",color:{argb:"FF727C8C"}}}; });
  let row=8; let weekNo=0; const groups=groupWeeks(state.entries);
  for (const g of groups) {
    weekNo++; const p=getPeriod(); const gs=new Date(Math.max(g.start,new Date(p.y,p.m,p.start))); const ge=new Date(Math.min(g.end,new Date(p.y,p.m,p.end)));
    ws.mergeCells(row,1,row,8); ws.getCell(row,1).value=`SEMANA ${weekNo} · ${gs.getDate()} AL ${ge.getDate()} DE ${MONTHS[p.m].toUpperCase()}`; ws.getCell(row,1).font={bold:true,color:{argb:"FF294D74"}}; ws.getCell(row,1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFEAF2FB"}}; ws.getCell(row,1).alignment={horizontal:"center"}; row++;
    ["DÍA / FECHA","INGRESO","SALIDA","PERMANENCIA","ALMUERZO","HORAS LABORADAS","PROYECTO","TRANSPORTE"].forEach((h,c)=>{ const cell=ws.getCell(row,c+1); cell.value=h; cell.font={bold:true,color:{argb:"FFFFFFFF"},size:9}; cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF265F9E"}}; cell.alignment={horizontal:"center",vertical:"middle",wrapText:true}; applyBorders(cell); });
    row++;
    const startDataRow=row;
    for (const e of g.entries) {
      const m=metrics(e); ws.getCell(row,1).value=fmtDateEs(e.date); ws.getCell(row,2).value=excelTime(e.start); ws.getCell(row,2).numFmt="h:mm AM/PM"; ws.getCell(row,3).value=excelTime(e.end); ws.getCell(row,3).numFmt="h:mm AM/PM";
      ws.getCell(row,4).value={formula:`ROUND(MOD(C${row}-B${row},1)*24,2)`,result:Number(m.presence.toFixed(2))}; ws.getCell(row,4).numFmt="0.00";
      ws.getCell(row,5).value=Number(e.lunch)||0; ws.getCell(row,5).numFmt="0.00"; ws.getCell(row,5).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFE4C4"}};
      ws.getCell(row,6).value={formula:`MAX(0,D${row}-E${row})`,result:Number(m.net.toFixed(2))}; ws.getCell(row,6).numFmt="0.00"; ws.getCell(row,7).value=e.project||""; ws.getCell(row,8).value=Number(e.transport)||0; ws.getCell(row,8).numFmt='"$"#,##0';
      for (let c=1;c<=8;c++){ applyBorders(ws.getCell(row,c)); ws.getCell(row,c).alignment={vertical:"middle",wrapText:c===1||c===7,horizontal:[2,3,4,5,6,8].includes(c)?"center":"left"}; ws.getCell(row,c).font={size:9}; }
      row++;
    }
    ws.mergeCells(row,1,row,3); ws.getCell(row,1).value=`TOTAL SEMANA ${weekNo}`; ws.getCell(row,1).font={bold:true}; ws.getCell(row,1).alignment={horizontal:"right"}; ws.getCell(row,6).value={formula:`SUM(F${startDataRow}:F${row-1})`,result:Number(g.entries.reduce((s,e)=>s+metrics(e).net,0).toFixed(2))}; ws.getCell(row,6).font={bold:true}; ws.getCell(row,6).numFmt="0.00"; ws.getCell(row,8).value={formula:`SUM(H${startDataRow}:H${row-1})`,result:g.entries.reduce((s,e)=>s+(Number(e.transport)||0),0)}; ws.getCell(row,8).numFmt='"$"#,##0'; ws.getCell(row,8).font={bold:true}; for (let c=1;c<=8;c++){ applyBorders(ws.getCell(row,c)); ws.getCell(row,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF4F5F7"}}; }
    row+=2;
  }
  ws.mergeCells(row,1,row,5); ws.getCell(row,1).value="TOTAL HORAS LABORADAS"; ws.getCell(row,1).font={bold:true,size:11}; ws.getCell(row,1).alignment={horizontal:"right"}; ws.getCell(row,6).value=Number(totalNet().toFixed(2)); ws.getCell(row,6).font={bold:true,size:11}; ws.getCell(row,6).numFmt="0.00"; for(let c=1;c<=8;c++){applyBorders(ws.getCell(row,c)); ws.getCell(row,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFD9DEE5"}};} row++;
  ws.mergeCells(row,1,row,8); ws.getCell(row,1).value=`NOTA: Las horas laboradas se calculan automáticamente como permanencia menos el tiempo de almuerzo registrado. TOTAL HORAS A CANCELAR: ${fmtHours(totalNet())} HORAS + AUXILIO DIARIO PACTADO POR ${Number($("aidDays").value)||0} DÍAS.`; ws.getCell(row,1).alignment={wrapText:true,horizontal:"center",vertical:"middle"}; ws.getCell(row,1).font={bold:true,size:9}; ws.getCell(row,1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFF99"}}; ws.getRow(row).height=38; applyBorders(ws.getCell(row,1)); row+=3;
  ws.getCell(row,1).value="FIRMA TRABAJADOR:"; ws.getCell(row,1).font={bold:true,size:9}; ws.mergeCells(row,2,row,4); ws.getCell(row,2).value=signatureName(); ws.getCell(row,2).font={name:"Segoe Script",italic:true,size:13}; ws.getCell(row,2).border={bottom:{style:"thin",color:{argb:"FF333333"}}}; ws.getCell(row,5).value="FIRMA SUPERVISOR:"; ws.getCell(row,5).font={bold:true,size:9}; ws.mergeCells(row,6,row,8); ws.getCell(row,6).value=""; ws.getCell(row,6).border={bottom:{style:"thin",color:{argb:"FF333333"}}}; row++;
  ws.getCell(row,2).value=excelDate($("documentDate").value||bogotaTodayISO()); ws.getCell(row,2).numFmt="dd/mm/yyyy"; ws.getCell(row,2).font={size:8}; row+=3;
  ws.mergeCells(row,1,row,8); ws.getCell(row,1).value="Nota: Proyecto corresponde a la planta o lugar donde se ejecutó la actividad."; ws.getCell(row,1).font={size:9}; row+=2;
  const t=totalTransport(), pct=(Number($("employerTransportPct").value)||0)/100;
  ws.getCell(row,1).value="RESUMEN DE TRANSPORTE"; ws.getCell(row,1).font={bold:true}; row++;
  const trRows=[["Total transporte registrado",t],["Porcentaje a cargo del empleador",pct],["Transporte a cargo del empleador",t*pct]];
  trRows.forEach((r,i)=>{ws.mergeCells(row,1,row,3); ws.getCell(row,1).value=r[0]; ws.getCell(row,4).value=r[1]; if(i===1) ws.getCell(row,4).numFmt="0%"; else ws.getCell(row,4).numFmt='"$"#,##0'; row++;});
  ws.pageSetup.printArea=`A1:H${row}`; ws.headerFooter.oddFooter="Página &P de &N";
  const data=wb.addWorksheet("Datos"); data.views=[{state:"frozen",ySplit:1}]; data.columns=[{header:"Fecha",key:"date",width:14},{header:"Ingreso",key:"start",width:12},{header:"Salida",key:"end",width:12},{header:"Almuerzo (h)",key:"lunch",width:14},{header:"Permanencia (h)",key:"presence",width:16},{header:"Horas laboradas",key:"net",width:16},{header:"Proyecto",key:"project",width:30},{header:"Transporte",key:"transport",width:15}];
  state.entries.forEach(e=>{const m=metrics(e); data.addRow({date:excelDate(e.date),start:e.start,end:e.end,lunch:e.lunch,presence:m.presence,net:m.net,project:e.project,transport:e.transport});}); data.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}}; data.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF265F9E"}}; data.getColumn(1).numFmt="dd/mm/yyyy"; data.getColumn(8).numFmt='"$"#,##0';
  const buffer=await wb.xlsx.writeBuffer(); downloadBlob(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`${safeFilenameBase()}.xlsx`);
}

function generatePdf() {
  if (!validateForExport()) return;
  const { jsPDF } = window.jspdf; const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"}); const left=12; let y=13;
  doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text("REPORTE DE TIEMPO LABORADO",105,y,{align:"center"}); y+=10;
  doc.setFontSize(9); const meta=[["NOMBRE",$("workerName").value],["CÉDULA",$("workerId").value],["CARGO",$("workerRole").value],["QUINCENA",periodText()]]; meta.forEach(([k,v])=>{doc.setFont("helvetica","bold");doc.text(`${k}:`,left,y);doc.setFont("helvetica","normal");doc.text(String(v),42,y);y+=5.5;}); y+=2;
  let weekNo=0; const groups=groupWeeks(state.entries);
  for (const g of groups) {
    weekNo++; const p=getPeriod(); const gs=new Date(Math.max(g.start,new Date(p.y,p.m,p.start))); const ge=new Date(Math.min(g.end,new Date(p.y,p.m,p.end))); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setFillColor(234,242,251); doc.rect(left,y-4,186,7,"F"); doc.text(`SEMANA ${weekNo} · ${gs.getDate()} AL ${ge.getDate()} DE ${MONTHS[p.m].toUpperCase()}`,105,y,{align:"center"}); y+=4;
    const body=g.entries.map(e=>{const m=metrics(e);return [fmtDateEs(e.date),fmtTime(e.start),fmtTime(e.end),`${fmtHours(m.presence)} h`,`${fmtHours(e.lunch)} h`,`${fmtHours(m.net)} h`,e.project||"",fmtMoney(e.transport).replace(/\s/g," ")];});
    doc.autoTable({startY:y,margin:{left,right:12},head:[["Día / fecha","Ingreso","Salida","Perman.","Almuerzo","Laboradas","Proyecto","Transporte"]],body,theme:"grid",styles:{font:"helvetica",fontSize:6.4,cellPadding:1.45,valign:"middle"},headStyles:{fillColor:[38,95,158],textColor:255,fontStyle:"bold",halign:"center"},columnStyles:{0:{cellWidth:29},1:{cellWidth:17,halign:"center"},2:{cellWidth:17,halign:"center"},3:{cellWidth:16,halign:"center"},4:{cellWidth:15,halign:"center",fillColor:[255,235,210]},5:{cellWidth:17,halign:"center",fontStyle:"bold"},6:{cellWidth:42},7:{cellWidth:29,halign:"right"}},didDrawPage:()=>{}}); y=doc.lastAutoTable.finalY+2;
    const wt=g.entries.reduce((s,e)=>s+metrics(e).net,0); doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.text(`Total semana ${weekNo}: ${fmtHours(wt)} h`,198,y,{align:"right"}); y+=6;
    if (y>250) { doc.addPage(); y=15; }
  }
  doc.setFillColor(220,224,230); doc.rect(left,y-4,186,8,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("TOTAL HORAS LABORADAS",left+3,y+1); doc.text(`${fmtHours(totalNet())} h`,196,y+1,{align:"right"}); y+=10;
  doc.setFillColor(255,250,170); doc.rect(left,y-3,186,16,"F"); doc.setFontSize(7.5); doc.setFont("helvetica","bold"); const note=`NOTA: Las horas laboradas se calculan como permanencia menos el tiempo de almuerzo registrado. Total horas a cancelar: ${fmtHours(totalNet())} horas + auxilio diario pactado por ${Number($("aidDays").value)||0} días.`; doc.text(doc.splitTextToSize(note,180),15,y+1); y+=21;
  doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.text("FIRMA TRABAJADOR:",left,y); doc.setFont("times","italic"); doc.setFontSize(11); doc.text(signatureName(),45,y); doc.setDrawColor(40); doc.line(44,y+1,105,y+1); doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.text("FIRMA SUPERVISOR:",112,y); doc.line(147,y+1,198,y+1); y+=5; doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.text(`Fecha de elaboración: ${formatDocDate()}`,left,y); y+=10;
  doc.setFontSize(7.5); doc.text("Proyecto corresponde a la planta o lugar donde se ejecutó la actividad.",left,y); y+=7;
  const t=totalTransport(), pct=(Number($("employerTransportPct").value)||0)/100; doc.setFont("helvetica","bold"); doc.text("RESUMEN DE TRANSPORTE",left,y); y+=5; doc.setFont("helvetica","normal"); doc.text(`Total transporte registrado: ${fmtMoney(t)}`,left,y); y+=4.5; doc.text(`Porcentaje a cargo del empleador: ${Math.round(pct*100)}%`,left,y); y+=4.5; doc.text(`Transporte a cargo del empleador: ${fmtMoney(t*pct)}`,left,y);
  doc.save(`${safeFilenameBase()}.pdf`);
}
function formatDocDate(){ const d=parseISO($("documentDate").value||bogotaTodayISO()); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; }
function downloadBlob(blob,name){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
function exportBackup(){ const blob=new Blob([JSON.stringify(currentSnapshot(),null,2)],{type:"application/json"}); downloadBlob(blob,`${safeFilenameBase()}_respaldo.json`); }
function importBackup(ev){ const file=ev.target.files?.[0]; if(!file)return; const r=new FileReader(); r.onload=()=>{try{const s=JSON.parse(r.result); localStorage.setItem(STORAGE_KEY,JSON.stringify(s)); location.reload();}catch{alert("El archivo de respaldo no es válido.");}}; r.readAsText(file); }

init();
