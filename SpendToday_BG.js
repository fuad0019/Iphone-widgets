// SpendToday_BG — generates transparent-*.png backgrounds for SpendToday widget
//
// HOW TO USE:
//  1) Make a BLANK home-screen page (no icons/widgets) with your wallpaper,
//     or temporarily clear a spot on an existing page.
//  2) Take a screenshot of that blank page (full screen).
//  3) Run this script in the Scriptable app. Pick the screenshot from Photos,
//     then pick widget size + position.
//  4) Repeat for each position you want (top / middle / bottom ...).
//  5) Add the SpendToday widget to that spot — it will be truly transparent.
//
// Tuning: if the transparency is off by a bit on your device/arrangement,
// adjust X_OFFSET / Y_OFFSET / SCALE below (in points).
const X_OFFSET = 0;   // shift crop right (+pt)
const Y_OFFSET = 0;   // shift crop down (+pt)
const SCALE = 0;      // force scale (px per point); 0 = auto from known iPhones
const PAGE_TOP = 196; // pts from screen top to first widget row (tune if needed)

const DEVICES = [
  { w: 1170, h: 2532, ptsW: 390, ptsH: 844 },   // iPhone 12/13/14/15/16 (6.1")
  { w: 1179, h: 2556, ptsW: 393, ptsH: 852 },   // iPhone 14/15 Pro
  { w: 1206, h: 2622, ptsW: 402, ptsH: 874 },   // iPhone 16 Pro
  { w: 1284, h: 2778, ptsW: 428, ptsH: 926 },   // iPhone 13 Pro Max / 14 Plus
  { w: 1290, h: 2796, ptsW: 430, ptsH: 932 },   // iPhone 15/16 Pro Max
  { w: 750, h: 1334, ptsW: 375, ptsH: 667 },    // iPhone SE (2nd/3rd)
  { w: 1080, h: 2340, ptsW: 390, ptsH: 844 },   // iPhone 12/13 mini (approx)
];

function dims() {
  const img = Photos.fromLibrary();
  const s = img.size;
  const dev = DEVICES.find(d => d.w === s.width && d.h === s.height);
  const ptsW = dev ? dev.ptsW : Math.round(s.width / 3);
  const ptsH = dev ? dev.ptsH : Math.round(s.height / 3);
  const scale = SCALE || s.width / ptsW;
  return { img, pxW: s.width, pxH: s.height, ptsW, ptsH, scale };
}

function pt(v) { return Math.round(v); }

function cellRect(fam, pos, d) {
  const { ptsW, scale } = d;
  const gap = 15;
  const small = 155, medW = 329, medH = 155, largeH = 338;
  let x = 0, y = 0, w = 0, h = 0;
  if (fam === "medium" || fam === "large") {
    w = medW; h = fam === "medium" ? medH : largeH;
    x = (ptsW - w) / 2;
  } else {
    w = small; h = small;
    const leftX = (ptsW - medW) / 2;
    x = pos.includes("left") ? leftX : (pos.includes("right") ? ptsW - leftX - small : (ptsW - small) / 2);
  }
  const row = pos.startsWith("top") ? 0 : pos.startsWith("middle") ? 1 : 2;
  y = PAGE_TOP + row * (h + gap);
  return { x: x + X_OFFSET, y: y + Y_OFFSET, w, h };
}

async function savePng() {
  const fm = FileManager.iCloud();
  // save next to this script (same folder as SpendToday.js)
  const dir = module.filename ? module.filename.replace(/[^/]*$/, "") : fm.documentsDirectory();
  const alert = new Alert();
  alert.title = "Størrelse";
  alert.addAction("Small"); alert.addAction("Medium"); alert.addAction("Large");
  const sizeIdx = await alert.present();
  const fam = ["small", "medium", "large"][sizeIdx];

  const alert2 = new Alert();
  alert2.title = "Placering";
  const positions = fam === "small"
    ? ["top-left", "top-middle", "top-right", "middle-left", "middle-middle", "middle-right", "bottom-left", "bottom-middle", "bottom-right"]
    : ["top", "middle", "bottom"];
  positions.forEach(p => alert2.addAction(p));
  const posIdx = await alert2.present();
  const pos = positions[posIdx];

  const { img, scale } = dims();
  const r = cellRect(fam, pos, { ptsW: img.size.width / scale, scale });
  const sx = pt(r.x * scale), sy = pt(r.y * scale);
  const cw = pt(r.w * scale), ch = pt(r.h * scale);

  const ctx = new DrawContext();
  ctx.size = new Size(cw, ch);
  ctx.drawImageAtRect(img, new Rect(0, 0, cw, ch), new Rect(sx, sy, cw, ch));

  const name = `transparent-${fam}-${pos}.png`;
  const path = fm.joinPath(dir, name);
  try { fm.remove(path); } catch (e) { /* not present */ }
  fm.writeImage(path, ctx.getImage());

  const ok = new Alert();
  ok.title = "Gemt";
  ok.message = `${name} oprettet. Tilføj SpendToday-widgetten på den placering.`;
  ok.addAction("OK");
  await ok.present();
}

savePng();
