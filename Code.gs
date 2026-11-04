/**
 * Mood Playlists: Google Apps Script backend
 *
 * Paste this into Extensions > Apps Script of an empty Google Sheet.
 * 1. Change TEACHER_PIN below.
 * 2. Run setup() once and approve the permissions.
 * 3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * 4. Copy the /exec URL into CONFIG.API_URL in index.html.
 * After any edit here: Deploy > Manage deployments > edit > Version: New version.
 *
 * Sheets it keeps:
 *   Control      one row per class period: round, phase, which group has which scenario
 *   Submissions  every playlist save (the newest save per group per round counts)
 *   Votes        every vote (the newest vote per device per round counts)
 */

const TEACHER_PIN = 'change-this-pin';
const SHUFFLE_SCENARIOS = true; // false = Birch always gets "focus", Cedar "vibes", and so on
const GROUPS = ['Birch', 'Cedar', 'Maple', 'Oak', 'Pine', 'Redwood', 'Willow'];
const SCENARIOS = ['focus', 'vibes', 'energy', 'confidence', 'stress', 'frustration', 'sunday'];
const PHASES = ['collect', 'listen', 'vote', 'results'];
const CACHE_SECONDS = 4;

const HEADERS = {
  Control: ['Period', 'Round', 'Phase', 'Scenario map', 'Updated'],
  Submissions: ['Timestamp', 'Period', 'Round', 'Group', 'Scenario', 'Song 1', 'Song 2', 'Song 3', 'Played in class', 'Start at', 'Why', 'Data'],
  Votes: ['Timestamp', 'Period', 'Round', 'Device', 'Voter group', 'Voted for scenario']
};

function setup() {
  Object.keys(HEADERS).forEach(sheet_);
}

function doGet(e) {
  return out_(handle_((e && e.parameter) || {}));
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return out_({ ok: false, error: 'The request was not valid JSON.' }); }
  return out_(handle_(body));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(p) {
  try {
    const period = cleanPeriod_(p.period);
    switch (p.action) {
      case 'state': return publicState_(period, p);
      case 'submit': return locked_(() => submit_(period, p));
      case 'vote': return locked_(() => vote_(period, p));
      case 'teacher': checkPin_(p); return teacherState_(period);
      case 'setPhase': checkPin_(p); return locked_(() => setPhase_(period, p.phase));
      case 'newRound': checkPin_(p); return locked_(() => newRound_(period));
      default: return { ok: false, error: 'Unknown action.' };
    }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/* ---------- helpers ---------- */

function cleanPeriod_(v) {
  const s = String(v || '').trim();
  if (!/^[A-Za-z0-9_-]{1,12}$/.test(s)) throw new Error('Missing or invalid class period.');
  return s;
}

function checkPin_(p) {
  if (String(p.pin || '') !== TEACHER_PIN) throw new Error('Wrong teacher PIN.');
}

let HOLDING_LOCK_ = false;
function locked_(fn) {
  if (HOLDING_LOCK_) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  HOLDING_LOCK_ = true;
  try { return fn(); }
  finally { HOLDING_LOCK_ = false; lock.releaseLock(); }
}

function clip_(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

// Stops Sheets from reading "1:09" as a time or "=..." as a formula.
function cell_(s) { s = String(s == null ? '' : s); return s ? "'" + s : ''; }

function parse_(s) { try { return JSON.parse(s); } catch (e) { return null; } }

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function newMap_() {
  const s = SCENARIOS.slice();
  if (SHUFFLE_SCENARIOS) {
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = s[i]; s[i] = s[j]; s[j] = t;
    }
  }
  const m = {};
  GROUPS.forEach((g, i) => { m[g] = s[i]; });
  return m;
}

function hash_(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/* ---------- control row ---------- */

function readControl_(period) {
  const v = sheet_('Control').getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === period) {
      return { row: i + 1, round: Number(v[i][1]) || 1, phase: String(v[i][2] || 'collect'), map: parse_(v[i][3]) || newMap_() };
    }
  }
  return null;
}

function control_(period) {
  const c = readControl_(period);
  if (c) return c;
  return locked_(() => {
    const again = readControl_(period);
    if (again) return again;
    sheet_('Control').appendRow([cell_(period), 1, 'collect', JSON.stringify(newMap_()), new Date()]);
    return readControl_(period);
  });
}

/* ---------- round data (cached for a few seconds to spare the Sheet) ---------- */

function round_(period) {
  const cache = CacheService.getScriptCache();
  const key = 'round:' + period;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const c = control_(period);
  const subs = {};
  sheet_('Submissions').getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[1]) === period && Number(r[2]) === c.round) {
      const s = parse_(r[11]);
      if (s && s.group) subs[s.group] = s;
    }
  });
  const votes = {};
  sheet_('Votes').getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[1]) === period && Number(r[2]) === c.round) {
      votes[String(r[3])] = { group: String(r[4]), scenario: String(r[5]) };
    }
  });

  const d = { c: { round: c.round, phase: c.phase, map: c.map }, subs: subs, votes: votes };
  try { cache.put(key, JSON.stringify(d), CACHE_SECONDS); } catch (e) {}
  return d;
}

function bust_(period) { CacheService.getScriptCache().remove('round:' + period); }

function playlists_(d, reveal) {
  const list = Object.keys(d.subs).map(g => d.subs[g]);
  list.sort((a, b) => hash_(d.c.round + ':' + a.scenario) - hash_(d.c.round + ':' + b.scenario));
  return list.map((s, i) => {
    const o = { letter: String.fromCharCode(65 + i), scenario: s.scenario, songs: s.songs, featured: s.featured, start: s.start, why: s.why };
    if (reveal) {
      o.group = s.group;
      o.votes = Object.keys(d.votes).filter(k => d.votes[k].scenario === s.scenario).length;
    }
    return o;
  });
}

/* ---------- actions ---------- */

function publicState_(period, p) {
  const d = round_(period);
  const g = String(p.group || '');
  const o = { ok: true, period: period, round: d.c.round, phase: d.c.phase, submittedCount: Object.keys(d.subs).length };
  if (GROUPS.indexOf(g) > -1) {
    o.myScenario = d.c.map[g];
    o.mySubmission = d.subs[g] || null;
  }
  if (d.c.phase !== 'collect') o.playlists = playlists_(d, false);
  if (p.device && d.votes[p.device]) o.myVote = d.votes[p.device].scenario;
  if (d.c.phase === 'results') o.results = playlists_(d, true).sort((a, b) => b.votes - a.votes);
  return o;
}

function submit_(period, p) {
  const c = control_(period);
  if (c.phase !== 'collect') throw new Error('Submissions are closed for this round.');
  const g = String(p.group || '');
  if (GROUPS.indexOf(g) < 0) throw new Error('Pick your tree group first.');
  const songs = (Array.isArray(p.songs) ? p.songs : []).slice(0, 3)
    .map(s => ({ title: clip_(s && s.title, 120), artist: clip_(s && s.artist, 120) }));
  if (songs.length !== 3 || songs.some(s => !s.title)) throw new Error('Add a title for all three songs.');
  const featured = Number(p.featured);
  if ([0, 1, 2].indexOf(featured) < 0) throw new Error('Choose the song you’ll play for the class.');

  const sub = {
    group: g, scenario: c.map[g], songs: songs, featured: featured,
    start: clip_(p.start, 12), why: clip_(p.why, 600), at: new Date().toISOString()
  };
  sheet_('Submissions').appendRow([
    new Date(), cell_(period), c.round, g, sub.scenario,
    cell_(songs[0].title + (songs[0].artist ? ' – ' + songs[0].artist : '')),
    cell_(songs[1].title + (songs[1].artist ? ' – ' + songs[1].artist : '')),
    cell_(songs[2].title + (songs[2].artist ? ' – ' + songs[2].artist : '')),
    featured + 1, cell_(sub.start), cell_(sub.why), JSON.stringify(sub)
  ]);
  bust_(period);
  return { ok: true, submission: sub };
}

function vote_(period, p) {
  const c = control_(period);
  if (c.phase !== 'vote') throw new Error('Voting isn’t open right now.');
  const g = String(p.group || '');
  if (GROUPS.indexOf(g) < 0) throw new Error('Pick your tree group first.');
  const device = String(p.device || '');
  if (!/^[A-Za-z0-9]{8,40}$/.test(device)) throw new Error('This device couldn’t be identified. Reload the page.');
  bust_(period);
  const d = round_(period);
  const sc = String(p.scenario || '');
  if (!Object.keys(d.subs).some(k => d.subs[k].scenario === sc)) throw new Error('That playlist doesn’t exist.');
  if (c.map[g] === sc) throw new Error('You can’t vote for your own group’s playlist.');
  sheet_('Votes').appendRow([new Date(), cell_(period), c.round, cell_(device), g, sc]);
  bust_(period);
  return { ok: true, myVote: sc };
}

function teacherState_(period) {
  const d = round_(period);
  return {
    ok: true, period: period, round: d.c.round, phase: d.c.phase,
    groups: GROUPS.map(g => ({ group: g, scenario: d.c.map[g], submitted: !!d.subs[g], at: d.subs[g] ? d.subs[g].at : null })),
    voteCount: Object.keys(d.votes).length,
    playlists: playlists_(d, true)
  };
}

function setPhase_(period, phase) {
  if (PHASES.indexOf(phase) < 0) throw new Error('Unknown phase.');
  const c = control_(period);
  const sh = sheet_('Control');
  sh.getRange(c.row, 3).setValue(phase);
  sh.getRange(c.row, 5).setValue(new Date());
  bust_(period);
  return teacherState_(period);
}

function newRound_(period) {
  const c = control_(period);
  sheet_('Control').getRange(c.row, 2, 1, 4).setValues([[c.round + 1, 'collect', JSON.stringify(newMap_()), new Date()]]);
  bust_(period);
  return teacherState_(period);
}
