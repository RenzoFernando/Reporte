(() => {
  "use strict";

  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const STORAGE_KEY = "reporteAppV2";
  const LEGACY_STORAGE_KEY = "reporteQuincenalV1";
  const APP_URL = "https://renzofernando.github.io/Reporte/";
  const $ = (id) => document.getElementById(id);

  let state = {
    entries: [],
    period: null,
    installPrompt: null
  };

  function bogotaTodayISO() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function parseISO(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function monthEnd(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function getPeriodFromControls() {
    const year = Number($("year").value);
    const month = Number($("month").value);
    const half = Number($("half").value);
    return {
      year,
      month,
      half,
      start: half === 1 ? 1 : 16,
      end: half === 1 ? 15 : monthEnd(year, month)
    };
  }

  function normalizePeriod(period) {
    const year = Number(period?.year) || Number(bogotaTodayISO().slice(0, 4));
    const month = Math.min(11, Math.max(0, Number(period?.month) || 0));
    const half = Number(period?.half) === 2 ? 2 : 1;
    return { year, month, half, start: half === 1 ? 1 : 16, end: half === 1 ? 15 : monthEnd(year, month) };
  }

  function periodKey(period = getPeriodFromControls()) {
    return `${period.year}-${period.month}-${period.half}`;
  }

  function periodText(period = getPeriodFromControls()) {
    return `${period.start} al ${period.end} de ${MONTHS[period.month]} de ${period.year}`;
  }

  function periodDays(period = getPeriodFromControls()) {
    const result = [];
    for (let day = period.start; day <= period.end; day += 1) {
      result.push(isoDate(new Date(period.year, period.month, day, 12)));
    }
    return result;
  }

  function mondayOf(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    copy.setHours(12, 0, 0, 0);
    return copy;
  }

  function sundayOf(date) {
    const copy = mondayOf(date);
    copy.setDate(copy.getDate() + 6);
    return copy;
  }

  function groupPeriodWeeks(period = getPeriodFromControls()) {
    const groups = new Map();
    for (const dateISO of periodDays(period)) {
      const date = parseISO(dateISO);
      const monday = mondayOf(date);
      const key = isoDate(monday);
      if (!groups.has(key)) {
        groups.set(key, { calendarStart: monday, calendarEnd: sundayOf(monday), dates: [] });
      }
      groups.get(key).dates.push(dateISO);
    }
    return [...groups.values()].sort((a, b) => a.calendarStart - b.calendarStart);
  }

  function withinPeriod(dateISO, period = getPeriodFromControls()) {
    const date = parseISO(dateISO);
    return date.getFullYear() === period.year && date.getMonth() === period.month && date.getDate() >= period.start && date.getDate() <= period.end;
  }

  function fullWorkerName() {
    return [$("workerFirstNames").value.trim(), $("workerLastNames").value.trim()].filter(Boolean).join(" ");
  }

  function fmtDateEs(dateISO) {
    const date = parseISO(dateISO);
    return `${DAYS[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
  }

  function fmtDateCompact(dateISO) {
    const date = parseISO(dateISO);
    return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
  }

  function capitalize(text) {
    const value = String(text || "");
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  function fmtTime(value) {
    if (!value) return "";
    const [hour, minute] = value.split(":").map(Number);
    const period = hour >= 12 ? "p. m." : "a. m.";
    const displayHour = ((hour + 11) % 12) + 1;
    return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
  }

  function timeMinutes(value) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }

  function metrics(entry) {
    let start = timeMinutes(entry.start);
    let end = timeMinutes(entry.end);
    if (end < start) end += 24 * 60;
    const presenceMinutes = Math.max(0, end - start);
    const lunchMinutes = Math.max(0, Number(entry.lunch || 0) * 60);
    return {
      presenceMinutes,
      lunchMinutes,
      netMinutes: Math.max(0, presenceMinutes - lunchMinutes)
    };
  }

  function fmtDuration(totalMinutes, { compact = false } = {}) {
    const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (compact) return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
    if (!remainder) return `${hours} h`;
    return `${hours} h ${remainder} min`;
  }

  function decimalHours(totalMinutes) {
    return Number(((Number(totalMinutes) || 0) / 60).toFixed(4));
  }

  function fmtMoney(value) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function daysWorked() {
    return state.entries.length;
  }

  function totalNetMinutes() {
    return state.entries.reduce((sum, entry) => sum + metrics(entry).netMinutes, 0);
  }

  function totalTransport() {
    return state.entries.reduce((sum, entry) => sum + (Number(entry.transport) || 0), 0);
  }

  function entryForDate(dateISO) {
    return state.entries.find((entry) => entry.date === dateISO) || null;
  }

  function entriesForDates(dates) {
    const set = new Set(dates);
    return state.entries.filter((entry) => set.has(entry.date));
  }

  function weekNetMinutes(dates) {
    return entriesForDates(dates).reduce((sum, entry) => sum + metrics(entry).netMinutes, 0);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function uniqueId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function safeFilenameBase() {
    const period = getPeriodFromControls();
    return `Reporte_${period.year}-${String(period.month + 1).padStart(2, "0")}_Q${period.half}`;
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function initSelects() {
    $("month").innerHTML = MONTHS.map((month, index) => `<option value="${index}">${capitalize(month)}</option>`).join("");
    const hourOptions = Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("");
    const minuteOptions = [0, 10, 20, 30, 40, 50].map((minute) => `<option value="${minute}">${String(minute).padStart(2, "0")}</option>`).join("");
    $("startHour").innerHTML = hourOptions;
    $("endHour").innerHTML = hourOptions;
    $("startMinute").innerHTML = minuteOptions;
    $("endMinute").innerHTML = minuteOptions;
  }

  function defaultPeriod() {
    const today = parseISO(bogotaTodayISO());
    return {
      year: today.getFullYear(),
      month: today.getMonth(),
      half: today.getDate() <= 15 ? 1 : 2
    };
  }

  function splitLegacyName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return { firstNames: parts[0] || "", lastNames: "" };
    if (parts.length === 2) return { firstNames: parts[0], lastNames: parts[1] };
    return { firstNames: parts.slice(0, -2).join(" ") || parts[0], lastNames: parts.slice(-2).join(" ") };
  }

  function migrateLegacy() {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    try {
      const legacy = JSON.parse(raw);
      const names = splitLegacyName(legacy.workerName);
      return {
        version: 2,
        workerFirstNames: names.firstNames,
        workerLastNames: names.lastNames,
        workerId: legacy.workerId || "",
        workerRole: legacy.workerRole || "",
        year: Number(legacy.year) || defaultPeriod().year,
        month: legacy.month === undefined || legacy.month === null ? defaultPeriod().month : Number(legacy.month),
        half: Number(legacy.half) === 2 ? 2 : 1,
        aidDays: legacy.aidDays ?? "",
        entries: Array.isArray(legacy.entries) ? legacy.entries.map((entry) => ({
          id: entry.id || uniqueId(),
          date: entry.date,
          start: entry.start,
          end: entry.end,
          lunch: [0, 1, 2, 3].includes(Number(entry.lunch)) ? Number(entry.lunch) : Math.max(0, Math.min(3, Math.round(Number(entry.lunch) || 0))),
          project: entry.project || "",
          transport: Number(entry.transport) || 0
        })) : []
      };
    } catch {
      return null;
    }
  }

  function load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      saved = null;
    }
    if (!saved) saved = migrateLegacy();

    const fallback = defaultPeriod();
    const period = normalizePeriod({
      year: saved?.year ?? fallback.year,
      month: saved?.month ?? fallback.month,
      half: saved?.half ?? fallback.half
    });

    $("workerFirstNames").value = saved?.workerFirstNames || "";
    $("workerLastNames").value = saved?.workerLastNames || "";
    $("workerId").value = saved?.workerId || "";
    $("workerRole").value = saved?.workerRole || "";
    $("year").value = period.year;
    $("month").value = period.month;
    $("half").value = period.half;
    $("aidDays").value = saved?.aidDays ?? "";

    state.period = period;
    state.entries = Array.isArray(saved?.entries)
      ? saved.entries.filter((entry) => entry?.date && entry?.start && entry?.end && withinPeriod(entry.date, period)).map((entry) => ({
          id: entry.id || uniqueId(),
          date: entry.date,
          start: entry.start,
          end: entry.end,
          lunch: [0, 1, 2, 3].includes(Number(entry.lunch)) ? Number(entry.lunch) : 0,
          project: String(entry.project || ""),
          transport: Number(entry.transport) || 0
        })).sort((a, b) => a.date.localeCompare(b.date))
      : [];
  }

  function currentSnapshot() {
    const period = getPeriodFromControls();
    return {
      version: 2,
      workerFirstNames: $("workerFirstNames").value,
      workerLastNames: $("workerLastNames").value,
      workerId: $("workerId").value,
      workerRole: $("workerRole").value,
      year: period.year,
      month: period.month,
      half: period.half,
      aidDays: $("aidDays").value,
      entries: state.entries
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSnapshot()));
      $("saveStatus").textContent = "Guardado";
    } catch {
      $("saveStatus").textContent = "Sin guardar";
    }
  }

  function setPeriodControls(period) {
    $("year").value = period.year;
    $("month").value = period.month;
    $("half").value = period.half;
  }

  function handlePeriodChange() {
    const next = normalizePeriod(getPeriodFromControls());
    const previous = state.period || next;
    if (periodKey(next) === periodKey(previous)) return;

    if (state.entries.length) {
      const proceed = window.confirm("Cambiar de quincena eliminará las jornadas registradas del periodo actual. Los datos del trabajador se conservarán. ¿Continuar?");
      if (!proceed) {
        setPeriodControls(previous);
        return;
      }
    }

    state.entries = [];
    $("aidDays").value = "";
    state.period = next;
    save();
    render();
  }

  function advancePeriod() {
    const current = getPeriodFromControls();
    if (state.entries.length && !window.confirm("¿Crear una nueva quincena? Se borrarán las jornadas actuales, pero se conservarán los datos del trabajador.")) return;
    const next = { ...current };
    if (current.half === 1) {
      next.half = 2;
    } else {
      next.half = 1;
      next.month += 1;
      if (next.month > 11) {
        next.month = 0;
        next.year += 1;
      }
    }
    state.entries = [];
    $("aidDays").value = "";
    state.period = normalizePeriod(next);
    setPeriodControls(state.period);
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setTimeControl(prefix, value) {
    const [hour24, minute] = String(value).split(":").map(Number);
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = ((hour24 + 11) % 12) + 1;
    $(`${prefix}Hour`).value = String(hour12);
    const minuteOptions = [0, 10, 20, 30, 40, 50];
    const snappedMinute = minuteOptions.reduce((best, option) => Math.abs(option - minute) < Math.abs(best - minute) ? option : best, 0);
    $(`${prefix}Minute`).value = String(snappedMinute);
    $(`${prefix}Period`).value = period;
  }

  function getTimeControl(prefix) {
    let hour = Number($(`${prefix}Hour`).value);
    const minute = Number($(`${prefix}Minute`).value);
    const period = $(`${prefix}Period`).value;
    if (period === "AM") hour = hour === 12 ? 0 : hour;
    if (period === "PM") hour = hour === 12 ? 12 : hour + 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function updateCalculationPreview() {
    const entry = {
      start: getTimeControl("start"),
      end: getTimeControl("end"),
      lunch: Number($("lunchHours").value) || 0
    };
    const result = metrics(entry);
    $("calculationPreview").textContent = `Permanencia: ${fmtDuration(result.presenceMinutes)} · Almuerzo: ${fmtDuration(result.lunchMinutes)} · Laboradas: ${fmtDuration(result.netMinutes)}`;
  }

  function openDayDialog(dateISO) {
    const entry = entryForDate(dateISO);
    const period = getPeriodFromControls();
    const weekIndex = groupPeriodWeeks(period).findIndex((week) => week.dates.includes(dateISO));
    $("editingDate").value = dateISO;
    $("dayDialogWeek").textContent = `SEMANA ${weekIndex + 1}`;
    $("dayDialogTitle").textContent = entry ? "Editar jornada" : "Registrar jornada";
    $("dayDialogDate").textContent = fmtDateEs(dateISO);
    $("entryError").textContent = "";

    setTimeControl("start", entry?.start || "07:00");
    setTimeControl("end", entry?.end || "15:00");
    $("lunchHours").value = String(entry?.lunch ?? 1);
    $("project").value = entry?.project || "";
    $("transport").value = entry?.transport ? String(entry.transport) : "";
    $("deleteEntryBtn").hidden = !entry;
    updateCalculationPreview();

    const dialog = $("dayDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDayDialog() {
    const dialog = $("dayDialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function saveDayEntry() {
    const date = $("editingDate").value;
    const entry = {
      id: entryForDate(date)?.id || uniqueId(),
      date,
      start: getTimeControl("start"),
      end: getTimeControl("end"),
      lunch: Number($("lunchHours").value) || 0,
      project: $("project").value.trim(),
      transport: Math.max(0, Number($("transport").value) || 0)
    };
    const result = metrics(entry);

    $("entryError").textContent = "";
    if (!withinPeriod(date)) {
      $("entryError").textContent = "La fecha no pertenece a la quincena seleccionada.";
      return;
    }
    if (result.presenceMinutes <= 0) {
      $("entryError").textContent = "La permanencia debe ser mayor que cero.";
      return;
    }
    if (result.lunchMinutes > result.presenceMinutes) {
      $("entryError").textContent = "El almuerzo no puede superar el tiempo de permanencia.";
      return;
    }

    const index = state.entries.findIndex((item) => item.date === date);
    if (index >= 0) state.entries[index] = entry;
    else state.entries.push(entry);
    state.entries.sort((a, b) => a.date.localeCompare(b.date));
    save();
    render();
    closeDayDialog();
    showToast("Jornada guardada");
  }

  function deleteEntry(dateISO, { fromDialog = false } = {}) {
    const entry = entryForDate(dateISO);
    if (!entry) return;
    if (!window.confirm(`¿Eliminar la jornada del ${fmtDateCompact(dateISO)}?`)) return;
    state.entries = state.entries.filter((item) => item.date !== dateISO);
    save();
    render();
    if (fromDialog) closeDayDialog();
    showToast("Jornada eliminada");
  }

  function renderPeriod() {
    const period = getPeriodFromControls();
    $("periodSummary").textContent = `${period.half === 1 ? "Primera" : "Segunda"} quincena de ${MONTHS[period.month]} de ${period.year}.`;
    $("periodBanner").textContent = `Quincena ${period.half} · ${periodText(period)}`;
    $("quincenaStartMarker").textContent = `Inicio quincena ${period.half}`;
    $("quincenaEndMarker").textContent = `Final quincena ${period.half}`;
  }

  function renderProjects() {
    const projects = [...new Set(state.entries.map((entry) => entry.project.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    $("projectList").innerHTML = projects.map((project) => `<option value="${escapeHtml(project)}"></option>`).join("");
  }

  function renderWeeks() {
    const container = $("weeksContainer");
    const period = getPeriodFromControls();
    const weeks = groupPeriodWeeks(period);

    container.innerHTML = weeks.map((week, index) => {
      const clippedStart = parseISO(week.dates[0]);
      const clippedEnd = parseISO(week.dates[week.dates.length - 1]);
      const total = weekNetMinutes(week.dates);
      const daysHtml = week.dates.map((dateISO) => {
        const date = parseISO(dateISO);
        const entry = entryForDate(dateISO);
        let detail = "Sin registro";
        if (entry) {
          const result = metrics(entry);
          const project = entry.project || "Sin proyecto";
          detail = `${fmtTime(entry.start)} – ${fmtTime(entry.end)} · ${escapeHtml(project)} · <span class="day-hours">${fmtDuration(result.netMinutes, { compact: true })}</span>`;
          if (entry.transport) detail += ` · ${fmtMoney(entry.transport)}`;
        }
        return `
          <div class="day-row" data-date="${dateISO}">
            <div class="day-main">
              <div class="day-title"><strong>${escapeHtml(DAYS[date.getDay()])}</strong><span>${date.getDate()} de ${MONTHS[date.getMonth()]}</span></div>
              <div class="day-detail ${entry ? "registered" : ""}">${detail}</div>
            </div>
            <div class="day-actions">
              <button class="day-button ${entry ? "filled" : ""}" type="button" data-action="edit" data-date="${dateISO}">${entry ? "Editar" : "Registrar"}</button>
              ${entry ? `<button class="trash-button" type="button" data-action="delete" data-date="${dateISO}" aria-label="Eliminar ${escapeHtml(DAYS[date.getDay()])} ${date.getDate()}">×</button>` : ""}
            </div>
          </div>`;
      }).join("");

      return `
        <section class="week-card" aria-labelledby="week-${index + 1}">
          <div class="week-header">
            <strong id="week-${index + 1}">Inicio semana ${index + 1}</strong>
            <span>${clippedStart.getDate()}–${clippedEnd.getDate()} ${MONTHS[period.month].slice(0, 3)}</span>
          </div>
          <div class="day-list">${daysHtml}</div>
          <div class="week-footer"><span>Final semana ${index + 1}</span><strong>${fmtDuration(total, { compact: true })}</strong></div>
        </section>`;
    }).join("");
  }

  function renderSummary() {
    const days = daysWorked();
    const total = totalNetMinutes();
    const transport = totalTransport();
    $("daysChip").textContent = `${days} día${days === 1 ? "" : "s"}`;
    $("hoursChip").textContent = fmtDuration(total, { compact: true });
    $("workedDaysSummary").textContent = String(days);
    $("workedHoursSummary").textContent = fmtDuration(total, { compact: true });
    $("transportSummary").textContent = fmtMoney(transport);
    $("transportMetric").hidden = transport <= 0;

    const aidValue = $("aidDays").value;
    const aidText = aidValue === "" ? "pendiente de confirmar" : `${Number(aidValue)} día${Number(aidValue) === 1 ? "" : "s"}`;
    $("notePreview").innerHTML = `<strong>Nota automática:</strong> Las horas laboradas se calculan como permanencia menos almuerzo. Total: <strong>${fmtDuration(total)}</strong>. Auxilio diario pactado: <strong>${aidText}</strong>.`;
  }

  function render() {
    renderPeriod();
    renderProjects();
    renderWeeks();
    renderSummary();
  }

  function focusField(id, message) {
    const element = $(id);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => element.focus(), 260);
    showToast(message);
  }

  function validateForExport() {
    if (!$("workerFirstNames").value.trim()) {
      focusField("workerFirstNames", "Completa los nombres del trabajador");
      return false;
    }
    if (!$("workerLastNames").value.trim()) {
      focusField("workerLastNames", "Completa los apellidos del trabajador");
      return false;
    }
    if (!$("workerId").value.trim()) {
      focusField("workerId", "Completa la cédula");
      return false;
    }
    if (!$("workerRole").value.trim()) {
      focusField("workerRole", "Completa el cargo");
      return false;
    }
    if (!state.entries.length) {
      document.querySelector(".days-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Registra al menos una jornada");
      return false;
    }
    if ($("aidDays").value === "") {
      focusField("aidDays", "Confirma los días con auxilio pactado");
      return false;
    }
    return true;
  }

  function ensureExportLibraries(type) {
    if (type === "excel" && !window.ExcelJS) {
      window.alert("No se pudo cargar el generador de Excel. Revisa la conexión a internet y vuelve a intentarlo.");
      return false;
    }
    if (type === "pdf" && (!window.jspdf?.jsPDF)) {
      window.alert("No se pudo cargar el generador de PDF. Revisa la conexión a internet y vuelve a intentarlo.");
      return false;
    }
    return true;
  }

  function excelTime(value) {
    return timeMinutes(value) / (24 * 60);
  }

  function excelDate(dateISO) {
    const date = parseISO(dateISO);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function applyBorders(cell, color = "FFB9C4CE") {
    cell.border = {
      top: { style: "thin", color: { argb: color } },
      left: { style: "thin", color: { argb: color } },
      bottom: { style: "thin", color: { argb: color } },
      right: { style: "thin", color: { argb: color } }
    };
  }

  async function generateExcel() {
    if (!validateForExport() || !ensureExportLibraries("excel")) return;

    const hasTransport = totalTransport() > 0;
    const columnCount = hasTransport ? 8 : 7;
    const lastColumnLetter = hasTransport ? "H" : "G";
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Renzo Fernando Mosquera Daza";
    workbook.subject = "Reporte de tiempo laborado";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Reporte", {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.15 }
      }
    });
    worksheet.views = [{ showGridLines: false }];

    worksheet.columns = hasTransport
      ? [{ width: 30 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 12 }, { width: 17 }, { width: 39 }, { width: 17 }]
      : [{ width: 31 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 12 }, { width: 17 }, { width: 49 }];

    worksheet.mergeCells(`A1:${lastColumnLetter}1`);
    const title = worksheet.getCell("A1");
    title.value = "REPORTE DE TIEMPO LABORADO";
    title.font = { bold: true, size: 16, color: { argb: "FF18212B" } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 26;

    const meta = [
      ["NOMBRE:", fullWorkerName()],
      ["CÉDULA:", $("workerId").value.trim()],
      ["CARGO:", $("workerRole").value.trim()],
      ["QUINCENA:", periodText()]
    ];
    meta.forEach(([label, value], index) => {
      const row = 3 + index;
      worksheet.getCell(row, 1).value = label;
      worksheet.getCell(row, 1).font = { bold: true, size: 9 };
      worksheet.mergeCells(row, 2, row, columnCount);
      const valueCell = worksheet.getCell(row, 2);
      valueCell.value = value;
      valueCell.font = { size: 10 };
      valueCell.border = { bottom: { style: "thin", color: { argb: "FF75818C" } } };
      valueCell.alignment = { vertical: "middle" };
      worksheet.getRow(row).height = 18;
    });

    let row = 8;
    const period = getPeriodFromControls();
    const weeks = groupPeriodWeeks(period);
    const headers = ["DÍA / FECHA", "INGRESO", "SALIDA", "PERMANENCIA", "ALMUERZO", "HORAS LABORADAS", "PROYECTO"];
    if (hasTransport) headers.push("TRANSPORTE");

    weeks.forEach((week, weekIndex) => {
      const weekEntries = entriesForDates(week.dates);
      const start = parseISO(week.dates[0]);
      const end = parseISO(week.dates[week.dates.length - 1]);

      worksheet.mergeCells(row, 1, row, columnCount);
      const marker = worksheet.getCell(row, 1);
      marker.value = `INICIO SEMANA ${weekIndex + 1} · ${start.getDate()} AL ${end.getDate()} DE ${MONTHS[period.month].toUpperCase()}`;
      marker.font = { bold: true, size: 9, color: { argb: "FF2B5978" } };
      marker.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9F2F8" } };
      marker.alignment = { horizontal: "center", vertical: "middle" };
      applyBorders(marker, "FFC8D8E4");
      worksheet.getRow(row).height = 20;
      row += 1;

      headers.forEach((header, index) => {
        const cell = worksheet.getCell(row, index + 1);
        cell.value = header;
        cell.font = { bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5F8B" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        applyBorders(cell, "FF174A6B");
      });
      worksheet.getRow(row).height = 26;
      row += 1;

      const startDataRow = row;
      for (const entry of weekEntries) {
        const result = metrics(entry);
        worksheet.getCell(row, 1).value = capitalize(fmtDateEs(entry.date));
        worksheet.getCell(row, 2).value = excelTime(entry.start);
        worksheet.getCell(row, 2).numFmt = "h:mm AM/PM";
        worksheet.getCell(row, 3).value = excelTime(entry.end);
        worksheet.getCell(row, 3).numFmt = "h:mm AM/PM";
        worksheet.getCell(row, 4).value = { formula: `ROUND(MOD(C${row}-B${row},1)*24,4)`, result: decimalHours(result.presenceMinutes) };
        worksheet.getCell(row, 4).numFmt = "0.00";
        worksheet.getCell(row, 5).value = Number(entry.lunch) || 0;
        worksheet.getCell(row, 5).numFmt = "0.00";
        worksheet.getCell(row, 5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE9D1" } };
        worksheet.getCell(row, 6).value = { formula: `MAX(0,D${row}-E${row})`, result: decimalHours(result.netMinutes) };
        worksheet.getCell(row, 6).numFmt = "0.00";
        worksheet.getCell(row, 6).font = { bold: true, size: 9.5 };
        worksheet.getCell(row, 7).value = entry.project || "";
        if (hasTransport) {
          worksheet.getCell(row, 8).value = entry.transport ? Number(entry.transport) : null;
          worksheet.getCell(row, 8).numFmt = '"$"#,##0';
        }
        for (let column = 1; column <= columnCount; column += 1) {
          const cell = worksheet.getCell(row, column);
          applyBorders(cell);
          cell.alignment = {
            vertical: "middle",
            wrapText: column === 1 || column === 7,
            horizontal: [2, 3, 4, 5, 6, 8].includes(column) ? "center" : "left"
          };
          if (column !== 6) cell.font = { ...(cell.font || {}), size: 9.2 };
        }
        worksheet.getRow(row).height = 23;
        row += 1;
      }

      worksheet.mergeCells(row, 1, row, 5);
      const weekLabel = worksheet.getCell(row, 1);
      weekLabel.value = `FINAL SEMANA ${weekIndex + 1}`;
      weekLabel.font = { bold: true, size: 9 };
      weekLabel.alignment = { horizontal: "right", vertical: "middle" };
      worksheet.getCell(row, 6).value = weekEntries.length
        ? { formula: `SUM(F${startDataRow}:F${row - 1})`, result: decimalHours(weekNetMinutes(week.dates)) }
        : 0;
      worksheet.getCell(row, 6).numFmt = "0.00";
      worksheet.getCell(row, 6).font = { bold: true, size: 9.5 };
      if (hasTransport) {
        worksheet.getCell(row, 8).value = weekEntries.reduce((sum, entry) => sum + (Number(entry.transport) || 0), 0) || null;
        worksheet.getCell(row, 8).numFmt = '"$"#,##0';
        worksheet.getCell(row, 8).font = { bold: true, size: 9 };
      }
      for (let column = 1; column <= columnCount; column += 1) {
        const cell = worksheet.getCell(row, column);
        applyBorders(cell);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F8" } };
      }
      worksheet.getRow(row).height = 20;
      row += 2;
    });

    worksheet.mergeCells(row, 1, row, 5);
    worksheet.getCell(row, 1).value = `FINAL QUINCENA ${period.half} · TOTAL HORAS LABORADAS`;
    worksheet.getCell(row, 1).font = { bold: true, size: 10.5 };
    worksheet.getCell(row, 1).alignment = { horizontal: "right", vertical: "middle" };
    worksheet.getCell(row, 6).value = decimalHours(totalNetMinutes());
    worksheet.getCell(row, 6).numFmt = "0.00";
    worksheet.getCell(row, 6).font = { bold: true, size: 11 };
    if (hasTransport) {
      worksheet.getCell(row, 8).value = totalTransport();
      worksheet.getCell(row, 8).numFmt = '"$"#,##0';
      worksheet.getCell(row, 8).font = { bold: true, size: 10 };
    }
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = worksheet.getCell(row, column);
      applyBorders(cell, "FF9CAAB6");
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE4E9" } };
    }
    worksheet.getRow(row).height = 24;
    row += 1;

    worksheet.mergeCells(row, 1, row, columnCount);
    const noteCell = worksheet.getCell(row, 1);
    noteCell.value = `NOTA: Las horas laboradas corresponden a la permanencia menos el tiempo de almuerzo. TOTAL HORAS A CANCELAR: ${fmtDuration(totalNetMinutes()).toUpperCase()} + AUXILIO DIARIO PACTADO POR ${Number($("aidDays").value)} DÍAS.`;
    noteCell.font = { bold: true, size: 8.5, color: { argb: "FF5A472A" } };
    noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2C7" } };
    noteCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorders(noteCell, "FFE4C66A");
    worksheet.getRow(row).height = 38;
    row += 3;

    const signatureSplit = Math.ceil(columnCount / 2);
    worksheet.getCell(row, 1).value = "FIRMA TRABAJADOR:";
    worksheet.getCell(row, 1).font = { bold: true, size: 8.5 };
    worksheet.mergeCells(row, 2, row, signatureSplit);
    const workerSignature = worksheet.getCell(row, 2);
    workerSignature.value = fullWorkerName();
    workerSignature.font = { name: "Segoe Script", italic: true, size: 13 };
    workerSignature.alignment = { horizontal: "center" };
    workerSignature.border = { bottom: { style: "thin", color: { argb: "FF333333" } } };

    worksheet.getCell(row, signatureSplit + 1).value = "FIRMA SUPERVISOR:";
    worksheet.getCell(row, signatureSplit + 1).font = { bold: true, size: 8.5 };
    if (signatureSplit + 2 <= columnCount) {
      worksheet.mergeCells(row, signatureSplit + 2, row, columnCount);
      worksheet.getCell(row, signatureSplit + 2).border = { bottom: { style: "thin", color: { argb: "FF333333" } } };
    }
    row += 1;
    worksheet.mergeCells(row, 1, row, signatureSplit);
    worksheet.getCell(row, 1).value = `Fecha de elaboración: ${formatDocumentDate()}`;
    worksheet.getCell(row, 1).font = { size: 8 };
    row += 2;

    worksheet.mergeCells(row, 1, row, columnCount);
    worksheet.getCell(row, 1).value = "Nota: Proyecto corresponde a la planta o lugar donde se ejecutó la actividad.";
    worksheet.getCell(row, 1).font = { size: 8.5, color: { argb: "FF4B5661" } };
    row += 2;

    if (hasTransport) {
      worksheet.mergeCells(row, 1, row, 3);
      worksheet.getCell(row, 1).value = "TOTAL TRANSPORTE REGISTRADO";
      worksheet.getCell(row, 1).font = { bold: true, size: 9 };
      worksheet.getCell(row, 4).value = totalTransport();
      worksheet.getCell(row, 4).numFmt = '"$"#,##0';
      worksheet.getCell(row, 4).font = { bold: true, size: 9 };
      row += 1;
    }

    worksheet.pageSetup.printArea = `A1:${lastColumnLetter}${row}`;
    worksheet.headerFooter.oddFooter = "Reporte - Renzo Fernando Mosquera Daza";

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFilenameBase()}.xlsx`);
    showToast("Excel generado");
  }

  function formatDocumentDate() {
    const date = parseISO(bogotaTodayISO());
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function generatePdf() {
    if (!validateForExport() || !ensureExportLibraries("pdf")) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const hasTransport = totalTransport() > 0;
    const columnCount = hasTransport ? 8 : 7;
    const period = getPeriodFromControls();
    const weeks = groupPeriodWeeks(period);
    const left = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 11;

    doc.setTextColor(24, 33, 43);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14.5);
    doc.text("REPORTE DE TIEMPO LABORADO", pageWidth / 2, y, { align: "center" });
    y += 8;

    const meta = [
      ["NOMBRE", fullWorkerName(), "CÉDULA", $("workerId").value.trim()],
      ["CARGO", $("workerRole").value.trim(), "QUINCENA", periodText(period)]
    ];
    doc.setFontSize(8.5);
    meta.forEach((row) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${row[0]}:`, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(row[1]), 31, y, { maxWidth: 103 });
      doc.setFont("helvetica", "bold");
      doc.text(`${row[2]}:`, 151, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(row[3]), 174, y, { maxWidth: 113 });
      y += 5.2;
    });
    y += 1.5;

    const head = [["Día / fecha", "Ingreso", "Salida", "Permanencia", "Almuerzo", "Laboradas", "Proyecto", ...(hasTransport ? ["Transporte"] : [])]];
    const body = [];

    weeks.forEach((week, weekIndex) => {
      const start = parseISO(week.dates[0]);
      const end = parseISO(week.dates[week.dates.length - 1]);
      body.push([{
        content: `INICIO SEMANA ${weekIndex + 1} · ${start.getDate()} AL ${end.getDate()} DE ${MONTHS[period.month].toUpperCase()}`,
        colSpan: columnCount,
        styles: { fillColor: [233, 242, 248], textColor: [43, 89, 120], fontStyle: "bold", halign: "center", fontSize: 7.6, cellPadding: 1.5 }
      }]);

      const weekEntries = entriesForDates(week.dates);
      weekEntries.forEach((entry) => {
        const result = metrics(entry);
        body.push([
          capitalize(fmtDateEs(entry.date)),
          fmtTime(entry.start),
          fmtTime(entry.end),
          fmtDuration(result.presenceMinutes, { compact: true }),
          fmtDuration(result.lunchMinutes, { compact: true }),
          fmtDuration(result.netMinutes, { compact: true }),
          entry.project || "",
          ...(hasTransport ? [entry.transport ? fmtMoney(entry.transport).replace(/\s/g, " ") : ""] : [])
        ]);
      });

      const subtotal = [
        { content: `FINAL SEMANA ${weekIndex + 1}`, colSpan: 5, styles: { fillColor: [244, 246, 248], fontStyle: "bold", halign: "right" } },
        { content: fmtDuration(weekNetMinutes(week.dates), { compact: true }), styles: { fillColor: [244, 246, 248], fontStyle: "bold", halign: "center" } },
        { content: "", styles: { fillColor: [244, 246, 248] } }
      ];
      if (hasTransport) {
        subtotal.push({
          content: weekEntries.reduce((sum, entry) => sum + (Number(entry.transport) || 0), 0) ? fmtMoney(weekEntries.reduce((sum, entry) => sum + (Number(entry.transport) || 0), 0)).replace(/\s/g, " ") : "",
          styles: { fillColor: [244, 246, 248], fontStyle: "bold", halign: "right" }
        });
      }
      body.push(subtotal);
    });

    const styles = {
      font: "helvetica",
      fontSize: 7.1,
      cellPadding: 1.35,
      valign: "middle",
      lineColor: [190, 199, 207],
      lineWidth: 0.18,
      overflow: "linebreak"
    };

    const columnStyles = hasTransport
      ? {
          0: { cellWidth: 48 }, 1: { cellWidth: 23, halign: "center" }, 2: { cellWidth: 23, halign: "center" },
          3: { cellWidth: 28, halign: "center" }, 4: { cellWidth: 23, halign: "center", fillColor: [255, 242, 225] },
          5: { cellWidth: 29, halign: "center", fontStyle: "bold" }, 6: { cellWidth: 72 }, 7: { cellWidth: 31, halign: "right" }
        }
      : {
          0: { cellWidth: 50 }, 1: { cellWidth: 24, halign: "center" }, 2: { cellWidth: 24, halign: "center" },
          3: { cellWidth: 29, halign: "center" }, 4: { cellWidth: 24, halign: "center", fillColor: [255, 242, 225] },
          5: { cellWidth: 30, halign: "center", fontStyle: "bold" }, 6: { cellWidth: 96 }
        };

    doc.autoTable({
      startY: y,
      margin: { left, right: left, top: 10, bottom: 10 },
      head,
      body,
      theme: "grid",
      styles,
      headStyles: { fillColor: [31, 95, 139], textColor: 255, fontStyle: "bold", halign: "center", fontSize: 7.4, cellPadding: 1.5 },
      columnStyles,
      showHead: "everyPage"
    });

    y = doc.lastAutoTable.finalY + 4;
    if (y > 166) {
      doc.addPage("a4", "landscape");
      y = 14;
    }

    doc.setFillColor(221, 228, 233);
    doc.rect(left, y, pageWidth - left * 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`FINAL QUINCENA ${period.half} · TOTAL HORAS LABORADAS`, left + 3, y + 5.2);
    doc.text(fmtDuration(totalNetMinutes()), pageWidth - left - 3, y + 5.2, { align: "right" });
    y += 11;

    doc.setFillColor(255, 242, 199);
    doc.rect(left, y, pageWidth - left * 2, 13, "F");
    doc.setTextColor(90, 71, 42);
    doc.setFontSize(7.4);
    doc.setFont("helvetica", "bold");
    const note = `NOTA: Las horas laboradas corresponden a la permanencia menos el tiempo de almuerzo. Total horas a cancelar: ${fmtDuration(totalNetMinutes())} + auxilio diario pactado por ${Number($("aidDays").value)} días.`;
    doc.text(doc.splitTextToSize(note, pageWidth - left * 2 - 6), left + 3, y + 4.2);
    y += 18;

    doc.setTextColor(24, 33, 43);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("FIRMA TRABAJADOR:", left, y);
    doc.setFont("times", "italic");
    doc.setFontSize(11.5);
    doc.text(fullWorkerName(), 48, y);
    doc.setDrawColor(55, 55, 55);
    doc.line(47, y + 1, 128, y + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("FIRMA SUPERVISOR:", 157, y);
    doc.line(196, y + 1, pageWidth - left, y + 1);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(`Fecha de elaboración: ${formatDocumentDate()}`, left, y);
    y += 5;
    doc.text("Proyecto corresponde a la planta o lugar donde se ejecutó la actividad.", left, y);

    if (hasTransport) {
      doc.setFont("helvetica", "bold");
      doc.text(`Total transporte registrado: ${fmtMoney(totalTransport()).replace(/\s/g, " ")}`, pageWidth - left, y, { align: "right" });
    }

    doc.save(`${safeFilenameBase()}.pdf`);
    showToast("PDF generado");
  }

  function downloadBlob(blob, name) {
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(currentSnapshot(), null, 2)], { type: "application/json" });
    downloadBlob(blob, `${safeFilenameBase()}_copia.json`);
    showToast("Copia de seguridad creada");
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || !Array.isArray(data.entries)) throw new Error("Formato inválido");
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 2 }));
        window.location.reload();
      } catch {
        window.alert("La copia de seguridad no tiene un formato válido.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function shareApp() {
    const shareData = { title: "Reporte", text: "Aplicación para registrar tiempo laborado y generar Excel y PDF.", url: APP_URL };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(APP_URL);
        showToast("Enlace copiado");
      } else {
        window.prompt("Copia el enlace de la aplicación:", APP_URL);
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast("No se pudo compartir el enlace");
    }
  }

  async function installApp() {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $("installBtn").hidden = true;
  }

  function resetAll() {
    if (!window.confirm("Esto borrará el trabajador, las jornadas y la quincena guardada en este dispositivo. ¿Continuar?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.location.reload();
  }

  function bind() {
    ["workerFirstNames", "workerLastNames", "workerId", "workerRole", "aidDays"].forEach((id) => {
      $(id).addEventListener("input", () => {
        save();
        if (id === "aidDays") renderSummary();
      });
    });

    ["year", "month", "half"].forEach((id) => $(id).addEventListener("change", handlePeriodChange));

    $("weeksContainer").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const { action, date } = button.dataset;
      if (action === "edit") openDayDialog(date);
      if (action === "delete") deleteEntry(date);
    });

    ["startHour", "startMinute", "startPeriod", "endHour", "endMinute", "endPeriod", "lunchHours"].forEach((id) => {
      $(id).addEventListener("change", updateCalculationPreview);
    });

    $("saveEntryBtn").addEventListener("click", saveDayEntry);
    $("deleteEntryBtn").addEventListener("click", () => deleteEntry($("editingDate").value, { fromDialog: true }));
    $("closeDialogBtn").addEventListener("click", closeDayDialog);
    $("cancelDialogBtn").addEventListener("click", closeDayDialog);
    $("dayDialog").addEventListener("click", (event) => {
      if (event.target === $("dayDialog")) closeDayDialog();
    });

    $("downloadExcelBtn").addEventListener("click", generateExcel);
    $("downloadPdfBtn").addEventListener("click", generatePdf);
    $("newPeriodBtn").addEventListener("click", advancePeriod);
    $("exportBackupBtn").addEventListener("click", exportBackup);
    $("importBackupInput").addEventListener("change", importBackup);
    $("shareBtn").addEventListener("click", shareApp);
    $("installBtn").addEventListener("click", installApp);
    $("resetAllBtn").addEventListener("click", resetAll);

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installPrompt = event;
      $("installBtn").hidden = false;
    });
  }

  function initFooter() {
    document.querySelectorAll("[data-current-year]").forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });
  }

  function initServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }
  }

  function init() {
    initSelects();
    load();
    bind();
    render();
    save();
    initFooter();
    initServiceWorker();
  }

  init();
})();
