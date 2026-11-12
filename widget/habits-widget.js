// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: circle-notch;

/*  Monthly Habits — iPhone widget for the Scriptable app.
 *  Reads habits.json from your PRIVATE GitHub repo (same data as the website).
 *  Small = circular grid · Medium = grid + today · Large = grid + full to-do list.
 *  First run inside the Scriptable app: it asks for the repo and token once
 *  (stored in the iOS Keychain, never in this file). Tap the widget to open the site.
 */

const SITE_URL = 'https://delayaute.github.io/habit-tracker/';
const K_REPO = 'habits_repo', K_TOKEN = 'habits_token';

const G = new Color('#22c55e'), R = new Color('#ef4444'), O = new Color('#f59e0b');
const BG = new Color('#0b0b0c'), FG = new Color('#f4f4f2'), MUTED = new Color('#85857f');
const THIN = new Color('#f4f4f2', 0.3), EMPTY = new Color('#f4f4f2', 0.08);
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const DEFAULT_HABITS = ['Day planning','School work','Project work','Norwegian','Read 15 min',
  'Workout or stretching','Morning routine','No doomscrolling','No alcohol & junk food','No gooning'];

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const colorOf = s => s === 'g' ? G : s === 'r' ? R : s === 'o' ? O : null;

/* ---------- config & data ---------- */
async function getConfig(reset) {
  if (!reset && Keychain.contains(K_TOKEN) && Keychain.contains(K_REPO))
    return { repo: Keychain.get(K_REPO), token: Keychain.get(K_TOKEN) };
  if (config.runsInWidget) return null;
  const a = new Alert();
  a.title = 'Monthly Habits widget';
  a.message = 'Your private repo (owner/name) and the same GitHub token you use on the site.';
  a.addTextField('owner/repo', Keychain.contains(K_REPO) ? Keychain.get(K_REPO) : 'delayaute/habit-data');
  a.addSecureTextField('github_pat_…', '');
  a.addAction('Save');
  a.addCancelAction('Cancel');
  if (await a.present() === -1) return null;
  const repo = a.textFieldValue(0).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const token = a.textFieldValue(1).replace(/\s+/g, '');   // removes spaces / line breaks from copy-paste
  Keychain.set(K_REPO, repo);
  Keychain.set(K_TOKEN, token);
  return { repo, token };
}

async function loadData(cfg) {
  const req = new Request(`https://api.github.com/repos/${cfg.repo}/contents/habits.json`);
  req.headers = {
    'Authorization': 'Bearer ' + cfg.token,
    'Accept': 'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const json = await req.loadJSON();
  const code = req.response && req.response.statusCode;
  if (code !== 200) throw new Error(code === 401 ? 'Invalid token' : code === 404 ? 'habits.json not found' : (json && json.message) || 'HTTP ' + code);
  if (json && json.content && json.encoding === 'base64')        // fallback if raw mode is ignored
    return JSON.parse(Data.fromBase64String(json.content.replace(/\s/g, '')).toRawString());
  return json;
}

/* State of habit h on date d — past days left empty count as missed, like on the site. */
function stateOf(db, d, h) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const k = keyOf(d);
  const s = ((db.data || {})[k] || [])[h] || null;
  if (s) return s;
  const byDefault = db.byDefault || [7, 8, 9];          // pre-checked habits (no doomscrolling, etc.)
  if (byDefault.includes(h) && d <= now && k >= (db.start || keyOf(now))) return 'g';
  if (d < now && k >= (db.start || keyOf(now))) return 'r';
  return null;
}

function monthPct(db) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  let score = 0, tot = 0;
  for (let d = 1; d <= now.getDate(); d++)
    for (let h = 0; h < 10; h++) {
      const s = stateOf(db, new Date(y, m, d), h);
      if (s) { tot++; score += s === 'g' ? 1 : s === 'o' ? 0.5 : 0; }
    }
  return tot ? Math.round(score / tot * 100) : null;
}

/* ---------- circular grid ---------- */
function drawWheel(db, size) {
  const dc = new DrawContext();
  dc.size = new Size(size, size);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const n = new Date(y, m + 1, 0).getDate();
  const cx = size / 2, cy = size / 2, RO = size * 0.48, RI = size * 0.19, N = 10, RW = (RO - RI) / N;
  const SWEEP = 270, slot = SWEEP / n;
  const pt = (r, a) => { const t = a * Math.PI / 180; return new Point(cx + r * Math.sin(t), cy - r * Math.cos(t)); };
  const sectorPts = (ri, ro, a1, a2) => {
    const pts = [], steps = 4;
    for (let i = 0; i <= steps; i++) pts.push(pt(ro, a1 + (a2 - a1) * i / steps));
    for (let i = steps; i >= 0; i--) pts.push(pt(ri, a1 + (a2 - a1) * i / steps));
    return pts;
  };
  const fillPoly = (pts, col) => { const p = new Path(); p.addLines(pts); p.closeSubpath(); dc.addPath(p); dc.setFillColor(col); dc.fillPath(); };
  const strokePoly = (pts, col, w, close) => { const p = new Path(); p.addLines(pts); if (close) p.closeSubpath(); dc.addPath(p); dc.setStrokeColor(col); dc.setLineWidth(w); dc.strokePath(); };

  // cells
  for (let h = 0; h < N; h++) {
    const ro = RO - h * RW, ri = ro - RW;
    for (let d = 1; d <= n; d++) {
      const col = colorOf(stateOf(db, new Date(y, m, d), h)) || (d <= today ? EMPTY : null);
      if (col) fillPoly(sectorPts(ri, ro, (d - 1) * slot, d * slot), col);
    }
  }
  // outline (3/4 ring + two end lines)
  const arc = r => { const a = []; for (let i = 0; i <= 120; i++) a.push(pt(r, SWEEP * i / 120)); return a; };
  const lw = Math.max(1.5, size / 110);
  strokePoly(arc(RO), FG, lw);
  strokePoly(arc(RI), FG, lw);
  strokePoly([pt(RI, 0), pt(RO, 0)], FG, lw);
  strokePoly([pt(RI, SWEEP), pt(RO, SWEEP)], FG, lw);
  // today's column
  strokePoly(sectorPts(RI, RO, (today - 1) * slot, today * slot), FG, lw * 1.3, true);
  // centre: month success rate
  const pct = monthPct(db);
  dc.setTextColor(FG);
  dc.setFont(Font.heavySystemFont(size * 0.11));
  dc.setTextAlignedCenter();
  dc.drawTextInRect(pct === null ? '—' : pct + '%', new Rect(cx - RI, cy - size * 0.075, RI * 2, size * 0.14));
  return dc.getImage();
}

/* ---------- widget ---------- */
function addText(stack, text, font, color) {
  const t = stack.addText(text); t.font = font; t.textColor = color || FG; t.lineLimit = 1; return t;
}
function squares(stack, states, sz, gap) {
  const row = stack.addStack(); row.layoutHorizontally(); row.spacing = gap;
  states.forEach(s => {
    const q = row.addStack(); q.size = new Size(sz, sz);
    q.backgroundColor = colorOf(s) || BG; q.borderColor = colorOf(s) || THIN; q.borderWidth = 1.5;
  });
}
function untilMidnight() {
  const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.ceil((mid - now) / 60000));
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
}

async function buildWidget(db, family) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.url = SITE_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const names = db.habits || DEFAULT_HABITS;
  const states = names.map((_, h) => stateOf(db, now, h));
  const done = states.filter(s => s === 'g').length, half = states.filter(s => s === 'o').length;
  const left = names.filter((_, h) => !states[h]);

  if (family === 'small') {
    w.setPadding(8, 8, 8, 8);
    const img = w.addImage(drawWheel(db, 300));
    img.centerAlignImage();
    return w;
  }

  w.setPadding(14, 14, 14, 14);
  const top = w.addStack(); top.layoutHorizontally(); top.centerAlignContent();
  const img = top.addImage(drawWheel(db, 300));
  img.imageSize = new Size(family === 'large' ? 150 : 128, family === 'large' ? 150 : 128);
  top.addSpacer(14);

  const col = top.addStack(); col.layoutVertically();
  addText(col, `TODAY · ${MONTHS[now.getMonth()].slice(0, 3)} ${now.getDate()}`, Font.heavySystemFont(11), MUTED);
  col.addSpacer(2);
  const sc = col.addStack(); sc.layoutHorizontally(); sc.bottomAlignContent();
  addText(sc, String(done), Font.blackSystemFont(40));
  addText(sc, `/10${half ? ' +' + half + '½' : ''}`, Font.boldSystemFont(15), MUTED);
  col.addSpacer(6);
  squares(col, states, 11, 3);
  col.addSpacer(8);
  addText(col, left.length ? `${left.length} left · closes in ${untilMidnight()}` : 'All checked 🔥', Font.boldSystemFont(11), left.length ? MUTED : G);
  if (family === 'medium' && left.length) {
    col.addSpacer(3);
    const t = addText(col, left.slice(0, 3).join(' · ') + (left.length > 3 ? ' …' : ''), Font.semiboldSystemFont(11), FG);
    t.lineLimit = 2;
  }

  if (family === 'large') {
    w.addSpacer(12);
    names.forEach((name, h) => {
      const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent();
      const q = row.addStack(); q.size = new Size(14, 14);
      q.backgroundColor = colorOf(states[h]) || BG; q.borderColor = colorOf(states[h]) || FG; q.borderWidth = 1.5;
      row.addSpacer(8);
      addText(row, pad(h + 1), Font.heavySystemFont(12), MUTED);
      row.addSpacer(6);
      addText(row, name.toUpperCase(), Font.boldSystemFont(12), states[h] === 'g' ? MUTED : FG);
      w.addSpacer(4);
    });
  }
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget(); w.backgroundColor = BG; w.url = SITE_URL; w.setPadding(14, 14, 14, 14);
  addText(w, 'MONTHLY HABITS', Font.heavySystemFont(12), MUTED);
  w.addSpacer(6);
  const t = addText(w, '⚠️ ' + msg, Font.boldSystemFont(13), FG); t.lineLimit = 3;
  w.addSpacer(4);
  addText(w, 'Open Scriptable to set it up', Font.semiboldSystemFont(11), MUTED);
  return w;
}

/* ---------- run ---------- */
const family = config.widgetFamily || 'medium';
let widget;
try {
  const reset = !config.runsInWidget && args.queryParameters && args.queryParameters.reset === '1';
  let cfg = await getConfig(reset);
  let db = null;
  try {
    db = cfg ? await loadData(cfg) : null;
  } catch (e) {
    // Run from the app with a bad token / repo → offer to type them again, then retry once.
    if (config.runsInWidget) throw e;
    const a = new Alert();
    a.title = '⚠️ ' + (e.message || 'Error');
    a.message = 'GitHub refused the access. Enter the repo and token again?';
    a.addAction('Enter again');
    a.addCancelAction('Cancel');
    if (await a.present() === -1) throw e;
    cfg = await getConfig(true);
    db = cfg ? await loadData(cfg) : null;
  }
  widget = db ? await buildWidget(db, family) : errorWidget('Not set up yet');
} catch (e) {
  widget = errorWidget(e.message || String(e));
}
if (config.runsInWidget) Script.setWidget(widget);
else if (family === 'large') await widget.presentLarge();
else if (family === 'small') await widget.presentSmall();
else await widget.presentMedium();
Script.complete();
