# iPhone Scriptable Widgets

A set of transparent, good-looking widgets for [Scriptable](https://scriptable.app/) that read personal data from Google Sheets (published as CSV). No private data is hardcoded — you paste in your own published-sheet URL before use.

## Widgets

| File | What it shows | Expected sheet columns |
|---|---|---|
| `SpendToday.js` | Today's spend + month total | date, amount, (optional) description |
| `CalorieTrack.js` | Today's kcal + protein / carbs / fat | date, kcal, protein, carbs, fat, (optional) description |
| `HealthTrack.js` | Burned (active) calories today + exercise minutes | Date, Burned Kcal, Exercise Minutes |
| `SpendToday_BG.js` | Helper: generates transparent widget backgrounds | — |

All widgets auto-detect their columns by header name (English or Danish), handle Danish comma decimals and both `dd/mm/yyyy` and ISO `yyyy-mm-dd` dates, and support Home Screen sizes plus lock-screen circular/rectangular/inline widgets.

## Setup

1. Install [Scriptable](https://scriptable.app/) on your iPhone.
2. In Google Sheets: **File → Share → Publish to web** → pick the tab → format **Comma-separated values (.csv)** → **Publish** → copy the URL (ends in `.../pub?gid=0&single=true&output=csv`).
3. Open the widget's `.js` and paste your URL into `CSV_URL` at the top.
4. Move the file into **iCloud Drive/Scriptable** (open Scriptable once first so the folder exists) via the Files app.
5. On the Home Screen: add a **Scriptable** widget → tap it → choose the script. Optional **Parameter** = widget position for transparency (`top` / `middle` / `bottom`; small sizes: `top-left`, `top-right`, etc.).

## Transparent background

iOS widgets can't be truly transparent on their own. `SpendToday_BG.js` generates a cropped wallpaper image for each widget slot:

1. Make a blank Home Screen page (or empty spot) on your wallpaper.
2. Screenshot it, run `SpendToday_BG` in Scriptable, pick the screenshot, size and position.
3. It saves `transparent-<size>-<position>.png` next to the scripts — all widgets pick it up automatically. Without it they fall back to a dark glass card.

## Refreshing

Widgets ask iOS to re-run them every `REFRESH_MINUTES` (default 15) via `refreshAfterDate`. iOS decides the exact moment (usually on unlock / when in use). To force an update: open Scriptable and tap **▶** on the script.

## Data rules

- **One row per day** for spend/calories/burned kcal — duplicates double-count the daily totals. Update today's row rather than appending a second one if you log several times a day.
- Rows with a missing amount/kcal value are ignored.

## Notes

- **Apple Health** (`HealthTrack.js`): Scriptable cannot read HealthKit directly. Feed the sheet with a Shortcuts automation ("Find Health Samples" → "Calculate Statistics: Sum" → append) or an app like Health Auto Export. Keep the columns `Date, Burned Kcal, Exercise Minutes`.
- Widget text is in Danish by default (designed for a Danish user) — labels are simple to edit in the top constants of each script.
