// HealthTrack — transparent Scriptable widget for burned calories (Apple Health via a sheet)
// Shows active/burned calories today (and exercise minutes if you log them).
//
// Apple Health can't be read directly by Scriptable — route it through a sheet:
//  - Shortcuts automation: "Find Health Samples" (Active Energy, today) ->
//    "Calculate Statistics" (Sum) -> append row to a Google Sheet, OR
//  - the "Health Auto Export" app syncs Health to Google Sheets automatically.
// Then publish that tab as CSV and paste the URL below (same flow as the others).
//
// Expected columns (auto-detected): date/timestamp, burned kcal
// (kcal/calories/active energy/forbrændt), optional exercise minutes.

// ---------- CONFIG ----------
const CSV_URL = "PASTE_YOUR_PUBLISHED_CSV_URL_HERE";
const HAS_HEADER = true;
const DATE_DDMM = true;
const REFRESH_MINUTES = 15;
const TRANSPARENT = true;
const FALLBACK = { date: 0, kcal: 1, min: 2 };
// ---------- END CONFIG ----------

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const ACCENT_C = new Color("#ff453a");   // Apple move-ring red
const MAIN_C = new Color("#ffffff");
const MUTED_C = new Color("#9ca3af");
const MIN_C = new Color("#34d399");      // exercise minutes — green

function scriptDir() {
  const fm = FileManager.iCloud();
  const p = module.filename;
  return p ? p.replace(/[^/]*$/, "") : fm.documentsDirectory();
}

async function loadCsv() {
  const req = new Request(CSV_URL);
  req.timeoutInterval = 15;
  const text = await req.loadString();
  if (!text || text.length < 50 && !text.includes(",")) throw new Error("Tomt svar fra regnearket");
  return text;
}

function csvToRows(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function parseNum(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || !/\d/.test(s)) return null;
  s = s.replace(/\s+/g, "").replace(/g\b|g$/i, "").replace(/kcal|kj|min|minutes/gi, "").replace(/,-$/, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) { s = s.replace(/\./g, "").replace(",", "."); }
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    if (!(parts.length === 2 && parts[1].length <= 2)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function parseDateCell(raw) {
  const s = String(raw).trim().split(/\s+/)[0];
  const parts = s.split(/[/.\-]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
  if (parts.length < 2 || parts.length > 3) return null;
  let d, mo, y;
  if (parts.length === 3) {
    if (/^\d{4}/.test(s)) { y = parts[0]; mo = parts[1]; d = parts[2]; }
    else if (DATE_DDMM) { d = parts[0]; mo = parts[1]; y = parts[2]; }
    else { mo = parts[0]; d = parts[1]; y = parts[2]; }
    if (y < 100) y += 2000;
  } else {
    if (DATE_DDMM) { d = parts[0]; mo = parts[1]; } else { mo = parts[0]; d = parts[1]; }
    y = new Date().getFullYear();
  }
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return { d, mo, y };
}

function sameDay(a) {
  const n = new Date();
  if (!a) return false;
  return a.d === n.getDate() && a.mo === n.getMonth() + 1 && a.y === n.getFullYear();
}

function fmt(n) {
  if (n == null) return "0";
  const abs = Math.round(Math.abs(n) * 100) / 100;
  const int = Math.floor(abs);
  const cents = Math.round((abs - int) * 100);
  const intStr = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cents > 0 ? `${intStr},${String(cents).padStart(2, "0")}` : intStr;
}

// Render "<big number> <unit>" on one line, unit styled smaller beside the digits.
function unitBeside(parent, numText, unitText, numSize, center, accent) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  if (center) row.addSpacer();
  const num = row.addText(numText);
  num.font = Font.heavyRoundedSystemFont(numSize);
  num.textColor = MAIN_C;
  if (unitText) {
    row.addSpacer(5);
    const uni = row.addText(unitText);
    uni.font = Font.semiboldSystemFont(Math.max(9, Math.round(numSize * 0.4)));
    uni.textColor = accent;
  }
  if (center) row.addSpacer();
  return row;
}

async function fetchData() {
  const rows = csvToRows(await loadCsv());
  if (rows.length === 0) throw new Error("Ingen rækker i arket");
  let header = null, data = rows;
  if (HAS_HEADER) { header = rows[0].map(c => String(c).trim().toLowerCase()); data = rows.slice(1); }

  const find = rx => header ? header.findIndex(h => rx.test(h)) : -1;
  const cols = { ...FALLBACK };
  if (header) {
    const di = find(/dato|date|dag|tidspunkt|timestamp|time/);
    const ki = find(/burned|forbrændt|forbraendt|active.?energy|aktiv|energy|kcal|calories|kalorier|kalori/);
    const mi = find(/minutes|\bmin\b|exercise|motion|træning|traening/);
    if (di >= 0) cols.date = di;
    if (ki >= 0) cols.kcal = ki;
    if (mi >= 0 && mi !== cols.date && mi !== cols.kcal) cols.min = mi;
  }

  const now = new Date();
  const parsed = [];
  for (const r of data) {
    const kcal = parseNum(r[cols.kcal]);
    if (kcal == null) continue;
    parsed.push({
      pd: parseDateCell(r[cols.date]),
      kcal,
      min: parseNum(r[cols.min]) || 0,
    });
  }
  const sum = list => list.reduce((a, x) => ({ kcal: a.kcal + x.kcal, min: a.min + x.min, n: a.n + 1 }), { kcal: 0, min: 0, n: 0 });
  const todayList = parsed.filter(x => x.pd && sameDay(x.pd));
  const monthList = parsed.filter(x => x.pd && x.pd.y === now.getFullYear() && x.pd.mo === now.getMonth() + 1);
  return { today: sum(todayList), month: sum(monthList) };
}

async function compose(data) {
  const w = new ListWidget();
  w.setPadding(14, 16, 14, 16);
  const fam = config.widgetFamily || "medium";

  if (fam === "accessoryCircular" || fam === "accessoryRectangular" || fam === "accessoryInline") {
    return composeAccessory(data, fam);
  }

  if (TRANSPARENT) {
    const pos = (args.widgetParameter || "middle").toLowerCase();
    const file = `transparent-${fam}${pos ? "-" + pos : ""}.png`;
    try {
      const img = Image.fromFile(scriptDir() + file);
      if (img) w.backgroundImage = img;
    } catch (e) { /* fall through */ }
  }
  if (!w.backgroundImage) {
    const g = new LinearGradient();
    g.locations = [0, 1];
    g.colors = [new Color("#1c1013", 0.9), new Color("#0a0506", 0.94)];
    w.backgroundGradient = g;
  }

  const now = new Date();
  const kcal = data.today.kcal;
  const kcalStr = fmt(kcal);
  const minStr = fmt(data.today.min);
  const mainStack = w.addStack();
  mainStack.layoutVertically();

  if (fam === "small") {
    mainStack.addSpacer();
    unitBeside(mainStack, kcalStr, "kcal", 26, false, ACCENT_C);
    const l = mainStack.addText("forbrændt i dag");
    l.font = Font.mediumSystemFont(8);
    l.textColor = ACCENT_C;
    const m = mainStack.addText(minStr > 0 ? `motion: ${minStr} min` : `${MONTHS[now.getMonth()]}: ${fmt(data.month.kcal)}`);
    m.font = Font.regularSystemFont(8);
    m.textColor = MUTED_C;
    mainStack.addSpacer();
  } else if (fam === "medium") {
    const d = mainStack.addText(`${WEEKDAYS[now.getDay()]} · ${now.getDate()}. ${MONTHS[now.getMonth()]}`.toUpperCase());
    d.font = Font.mediumSystemFont(10);
    d.textColor = MUTED_C;
    mainStack.addSpacer(4);
    const body = mainStack.addStack();
    body.layoutHorizontally();
    body.addSpacer();
    const left = body.addStack();
    left.layoutVertically();
    unitBeside(left, kcalStr, "kcal", 34, false, ACCENT_C);
    const l = left.addText("forbrændt i dag");
    l.font = Font.mediumSystemFont(9);
    l.textColor = ACCENT_C;
    body.addSpacer();
    const right = body.addStack();
    right.layoutVertically();
    right.addSpacer();
    const row1 = right.addStack();
    row1.layoutHorizontally();
    row1.addSpacer();
    const v1 = row1.addText(`${minStr} min`);
    v1.font = Font.semiboldSystemFont(14);
    v1.textColor = MIN_C;
    row1.addSpacer();
    const row2 = right.addStack();
    row2.layoutHorizontally();
    row2.addSpacer();
    const v2 = row2.addText("motion");
    v2.font = Font.mediumSystemFont(8);
    v2.textColor = MUTED_C;
    row2.addSpacer();
    right.addSpacer(4);
    const row3 = right.addStack();
    row3.layoutHorizontally();
    row3.addSpacer();
    const v3 = row3.addText(`${fmt(data.month.kcal)} kcal/måned`);
    v3.font = Font.regularSystemFont(10);
    v3.textColor = MUTED_C;
    row3.addSpacer();
    right.addSpacer();
    body.addSpacer();
    mainStack.addSpacer();
  } else { // large (+extraLarge)
    const head = mainStack.addStack();
    head.layoutHorizontally();
    const d = head.addText(`${WEEKDAYS[now.getDay()]} · ${now.getDate()}. ${MONTHS[now.getMonth()]}`);
    d.font = Font.mediumSystemFont(13);
    d.textColor = MUTED_C;
    head.addSpacer();
    const mo = head.addText(`${MONTHS[now.getMonth()]}: ${fmt(data.month.kcal)} kcal`);
    mo.font = Font.mediumSystemFont(11);
    mo.textColor = MUTED_C;
    mainStack.addSpacer(8);
    unitBeside(mainStack, kcalStr, "kcal", 42, false, ACCENT_C);
    const l = mainStack.addText("forbrændt i dag");
    l.font = Font.mediumSystemFont(12);
    l.textColor = ACCENT_C;
    mainStack.addSpacer(12);
    const ring = mainStack.addStack();
    ring.layoutHorizontally();
    const minBig = ring.addText(`${minStr}`);
    minBig.font = Font.heavyRoundedSystemFont(26);
    minBig.textColor = MIN_C;
    ring.addSpacer(6);
    const minUnit = ring.addText("min motion");
    minUnit.font = Font.mediumSystemFont(12);
    minUnit.textColor = MUTED_C;
    mainStack.addSpacer();
  }

  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  return w;
}

function composeAccessory(data, fam) {
  const w = new ListWidget();
  const kcalStr = fmt(data.today.kcal);
  if (fam === "accessoryCircular") {
    const size = kcalStr.length <= 4 ? 21 : kcalStr.length <= 6 ? 17 : 13;
    const st = w.addStack();
    st.layoutVertically();
    st.addSpacer();
    const t = st.addText(kcalStr);
    t.font = Font.heavyRoundedSystemFont(size);
    t.textColor = MAIN_C;
    t.centerAlignText();
    const u = st.addText("kcal brændt");
    u.font = Font.mediumSystemFont(7);
    u.textColor = ACCENT_C;
    u.centerAlignText();
    st.addSpacer();
  } else if (fam === "accessoryRectangular") {
    const l1 = w.addText(`${kcalStr} kcal forbrændt`);
    l1.font = Font.semiboldSystemFont(14);
    l1.textColor = MAIN_C;
    l1.lineLimit = 1;
    const l2 = w.addText(`${fmt(data.today.min)} min motion`);
    l2.font = Font.regularSystemFont(12);
    l2.textColor = MIN_C;
    l2.lineLimit = 1;
  } else {
    const t = w.addText(`🔥  ${kcalStr} kcal brændt · ${fmt(data.today.min)} min`);
    t.font = Font.mediumSystemFont(12);
    t.textColor = MAIN_C;
    t.lineLimit = 1;
  }
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  return w;
}

async function run() {
  try {
    const w = await compose(await fetchData());
    Script.setWidget(w);
  } catch (e) {
    const w = new ListWidget();
    w.setPadding(12, 14, 12, 14);
    w.backgroundColor = new Color("#160b0d");
    const t = w.addText("Kunne ikke hente data");
    t.font = Font.mediumSystemFont(12);
    t.textColor = Color.red();
    const s = w.addText(String(e && e.message || e));
    s.font = Font.regularSystemFont(9);
    s.textColor = new Color("#94a3b8");
    Script.setWidget(w);
  }
  Script.complete();
}
run();
