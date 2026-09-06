// SpendToday — transparent Scriptable widget for daily spend
// Shows today's date and how much you've spent, read from your Google Sheet.
//
// SETUP (5 min):
//  1) Make the sheet readable:
//     A) RECOMMENDED: Google Sheets -> File -> Share -> "Publish to web" ->
//        Tab: "September 2026", Format: "Comma-separated values (.csv)" ->
//        Publish -> copy the URL (looks like .../pub?gid=YOUR_SHEET_ID&single=true&output=csv)
//        and paste it into CSV_URL below. Only that tab is exposed.
//     B) Alternative: Share -> "Anyone with the link" -> Viewer. Then the
//        /export URL below already works (no publish needed), but the whole
//        spreadsheet becomes readable by anyone with the link.
//  2) Save this file into "iCloud Drive/Scriptable" (Files app -> move).
//  3) Add a Scriptable widget to your home screen -> tap it -> choose
//     "SpendToday". Optional "Parameter": position for transparency
//     (medium/large: "top", "middle", "bottom"; small: "top-left", "top-right",
//     "middle-left", ... "bottom-right").
//  4) For TRUE wallpaper transparency: run the companion script
//     "SpendToday_BG" once per position (needs a screenshot of a blank page),
//     which creates transparent-<family>-<position>.png next to this file.
//     Without it the widget falls back to a dark glass card.

// ---------- CONFIG ----------
const CSV_URL = "PASTE_YOUR_PUBLISHED_CSV_URL_HERE"; // e.g. .../spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv
// If you publish to web instead, replace the line above with the .../pub?...&output=csv URL.

const HAS_HEADER = true;        // first row is a header row
const DATE_DDMM = true;         // Danish sheet: dates are dd/mm(/(yyyy)). false = mm/dd
const FALLBACK_DATE_COL = 0;    // used if no header named like date/dato
const FALLBACK_AMOUNT_COL = 1;  // used if no header named like beløb/amount/kr
const REFRESH_MINUTES = 15;     // how often the widget asks iOS to re-run (iOS may still defer)
const TRANSPARENT = true;       // use transparent-*.png when present (fallback: dark glass)

// fine-tune the look
const ACCENT = "#34d399";       // emerald — money accent
const TEXT_MAIN = "#ffffff";
// ---------- END CONFIG ----------

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const ACCENT_C = new Color(ACCENT);
const MAIN_C = new Color(TEXT_MAIN);
const MUTED_C = new Color("#9ca3af");
const HAIR_C = new Color("#ffffff", 0.14);

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

function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || !/\d/.test(s)) return null;
  s = s.replace(/\s+/g, "").replace(/kr\.?/gi, "").replace(/dkk/gi, "").replace(/,-$/, "");
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
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
  return isFinite(n) ? (neg ? -n : n) : null;
}

function parseDateCell(raw) {
  // Handles: 2026-09-06 (ISO/bank), 06-09-2026, 06/09/2026, 06/09, datetimes like "2026-09-06 12:00"
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

function fmtAmount(n) {
  const abs = Math.round(Math.abs(n) * 100) / 100;
  const int = Math.floor(abs);
  const cents = Math.round((abs - int) * 100);
  const intStr = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cents > 0 ? `${intStr},${String(cents).padStart(2, "0")}` : intStr;
}

function spentStats(amounts) {
  // This tab only contains Apple Pay expenses logged as positive amounts —
  // every row counts as money spent.
  let sum = 0, cnt = 0;
  for (const a of amounts) {
    if (a == null) continue;
    sum += a;
    cnt++;
  }
  return { spent: Math.abs(sum), cnt };
}

async function fetchData() {
  const rows = csvToRows(await loadCsv());
  if (rows.length === 0) throw new Error("Ingen rækker i arket");
  let header = null, data = rows;
  if (HAS_HEADER) { header = rows[0].map(c => String(c).trim().toLowerCase()); data = rows.slice(1); }
  let dateCol = FALLBACK_DATE_COL, amtCol = FALLBACK_AMOUNT_COL, descCol = -1;
  if (header) {
    const fi = rx => header.findIndex(h => rx.test(h));
    const di = fi(/dato|date|dag|tidspunkt/);
    const ai = fi(/beløb|belob|amount|udgift|pris|sum|penge|kroner|værdi|vaerdi|kr$/);
    if (di >= 0) dateCol = di;
    if (ai >= 0) amtCol = ai;
    if (amtCol === dateCol) amtCol = dateCol === 0 ? 1 : 0;
    const dei = fi(/beskriv|note|tekst|kategori|butik|sted|description|kommentar/);
    if (dei >= 0 && dei !== dateCol && dei !== amtCol) descCol = dei;
  }
  const now = new Date();
  const parsed = [];
  for (const r of data) {
    const amt = parseAmount(r[amtCol]);
    if (amt == null) continue;
    parsed.push({
      amt,
      pd: parseDateCell(r[dateCol]),
      desc: descCol >= 0 ? String(r[descCol] || "").trim() : "",
    });
  }
  // Today
  const todayParsed = parsed.filter(row => row.pd && sameDay(row.pd));
  const today = spentStats(todayParsed.map(row => row.amt));
  const todayRows = todayParsed.slice(0, 6).map(row => ({ desc: row.desc, amt: row.amt }));
  // Month: only rows whose transaction date is in the current month/year
  const monthParsed = parsed.filter(row => row.pd && row.pd.y === now.getFullYear() && row.pd.mo === now.getMonth() + 1);
  const month = spentStats(monthParsed.map(row => row.amt));
  return { today, month, todayRows, hasDesc: descCol >= 0 };
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

async function compose(data) {
  const w = new ListWidget();
  w.setPadding(14, 16, 14, 16);
  const fam = config.widgetFamily || "medium";

  // Lock-screen accessory widgets: transparent by nature, need compact layouts
  if (fam === "accessoryCircular" || fam === "accessoryRectangular" || fam === "accessoryInline") {
    return composeAccessory(data, fam);
  }

  // --- transparent background if PNG exists, else dark glass ---
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
    g.colors = [new Color("#141824", 0.9), new Color("#07080d", 0.94)];
    w.backgroundGradient = g;
  }

  const now = new Date();
  const dateLabel = `${WEEKDAYS[now.getDay()]} · ${now.getDate()}. ${MONTHS[now.getMonth()]}`;
  const spent = data.today.spent;
  const mainStack = w.addStack();
  mainStack.layoutVertically();

  if (fam === "small") {
    mainStack.addSpacer();
    const amt = mainStack.addText(fmtAmount(spent));
    amt.font = Font.heavyRoundedSystemFont(30);
    amt.textColor = MAIN_C;
    amt.centerAlignText();
    const lab = mainStack.addText("brugt i dag");
    lab.font = Font.mediumSystemFont(10);
    lab.textColor = ACCENT_C;
    lab.centerAlignText();
    mainStack.addSpacer(2);
    const mo = mainStack.addText(`${MONTHS[now.getMonth()]} ${fmtAmount(data.month.spent)} kr`);
    mo.font = Font.regularSystemFont(9);
    mo.textColor = MUTED_C;
    mo.centerAlignText();
    mainStack.addSpacer();
  } else if (fam === "medium") {
    const d = mainStack.addText(dateLabel.toUpperCase());
    d.font = Font.mediumSystemFont(11);
    d.textColor = MUTED_C;
    mainStack.addSpacer(6);
    const row = mainStack.addStack();
    row.layoutHorizontally();
    row.addSpacer();
    const amt = row.addText(fmtAmount(spent));
    amt.font = Font.heavyRoundedSystemFont(36);
    amt.textColor = MAIN_C;
    row.addSpacer(6);
    const unit = row.addText("kr");
    unit.font = Font.mediumSystemFont(15);
    unit.textColor = ACCENT_C;
    row.addSpacer();
    mainStack.addSpacer(4);
    const sub = mainStack.addStack();
    sub.layoutHorizontally();
    sub.addSpacer();
    const info = sub.addText(`${data.today.cnt} køb i dag · ${MONTHS[now.getMonth()]}: ${fmtAmount(data.month.spent)} kr`);
    info.font = Font.regularSystemFont(11);
    info.textColor = MUTED_C;
    sub.addSpacer();
    mainStack.addSpacer();
  } else { // large
    const head = mainStack.addStack();
    head.layoutHorizontally();
    const d = head.addText(dateLabel);
    d.font = Font.mediumSystemFont(13);
    d.textColor = MUTED_C;
    head.addSpacer();
    const mo = head.addText(`${MONTHS[now.getMonth()]} i alt`);
    mo.font = Font.mediumSystemFont(11);
    mo.textColor = MUTED_C;
    mainStack.addSpacer(10);
    const amt = mainStack.addText(`${fmtAmount(spent)} kr`);
    amt.font = Font.heavyRoundedSystemFont(44);
    amt.textColor = MAIN_C;
    const lab = mainStack.addText("brugt i dag");
    lab.font = Font.mediumSystemFont(12);
    lab.textColor = ACCENT_C;
    mainStack.addSpacer(10);
    const line = mainStack.addStack();
    line.layoutHorizontally();
    line.addSpacer();
    mainStack.addSpacer(2);
    if (data.todayRows.length > 0) {
      const rows = data.todayRows.slice(0, 6);
      for (const r of rows) {
        const rr = mainStack.addStack();
        rr.layoutHorizontally();
        rr.addSpacer(1);
        const dd = rr.addText(truncate(r.hasDesc ? r.desc : "Køb", 24));
        dd.font = Font.regularSystemFont(12);
        dd.textColor = MUTED_C;
        dd.lineLimit = 1;
        rr.addSpacer();
        const aa = rr.addText(`${fmtAmount(r.amt)} kr`);
        aa.font = Font.semiboldSystemFont(12);
        aa.textColor = MAIN_C;
        mainStack.addSpacer(6);
      }
    } else {
      const e = mainStack.addText("Ingen køb i dag endnu");
      e.font = Font.regularSystemFont(12);
      e.textColor = MUTED_C;
    }
    mainStack.addSpacer();
  }

  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  return w;
}

// Compact layouts for lock-screen widgets (accessoryCircular / accessoryRectangular / accessoryInline)
function composeAccessory(data, fam) {
  const w = new ListWidget();
  const now = new Date();
  const spentStr = fmtAmount(data.today.spent);
  const monthStr = fmtAmount(data.month.spent);

  if (fam === "accessoryCircular") {
    // fit the number inside the circle: shrink font for long amounts
    const size = spentStr.length <= 4 ? 21 : spentStr.length <= 6 ? 17 : spentStr.length <= 9 ? 13 : 11;
    const st = w.addStack();
    st.layoutVertically();
    st.addSpacer();
    const t = st.addText(spentStr);
    t.font = Font.heavyRoundedSystemFont(size);
    t.textColor = MAIN_C;
    t.centerAlignText();
    const u = st.addText("kr i dag");
    u.font = Font.mediumSystemFont(8);
    u.textColor = ACCENT_C;
    u.centerAlignText();
    st.addSpacer();
  } else if (fam === "accessoryRectangular") {
    const l1 = w.addText(`${spentStr} kr`);
    l1.font = Font.semiboldSystemFont(16);
    l1.textColor = MAIN_C;
    l1.lineLimit = 1;
    const l2 = w.addText(`i dag · ${now.getDate()}. ${MONTHS[now.getMonth()]}`);
    l2.font = Font.regularSystemFont(10);
    l2.textColor = MUTED_C;
    l2.lineLimit = 1;
    const l3 = w.addText(`${MONTHS[now.getMonth()]}: ${monthStr} kr`);
    l3.font = Font.mediumSystemFont(10);
    l3.textColor = ACCENT_C;
    l3.lineLimit = 1;
  } else {
    // accessoryInline — single short line next to the clock
    const t = w.addText(`🛍  ${spentStr} kr i dag · ${monthStr} kr/måned`);
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
    w.backgroundColor = new Color("#101218");
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
