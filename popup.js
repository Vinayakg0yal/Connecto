/* Connecto popup. Settings + controls; live progress comes from chrome.storage ("run"). */
const NOTE = globalThis.CONNECTO_NOTE;
const DEFAULTS = {
  modeChoice: 'auto',
  note: '',
  freeFallback: 'withoutNote',
  shortNote: ''
};
// LinkedIn doesn't publish its weekly invitation limit. These are the typical
// figures: about 100 a week on Free accounts and about 200 on Premium.
const WEEKLY_LIMITS = { free: 100, premium: 200 };
const TYPICAL_FREE_NOTES = 5;   // typical Free personalized notes per month
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SEARCH_RE = /^https:\/\/www\.linkedin\.com\/search\/results\/people/;
const ACTIVE = ['running', 'stopping', 'scanning'];
const STALE_MS = 45000;

const $ = id => document.getElementById(id);
let settings = { ...DEFAULTS };
let run = null;
let history = [];
let noteQuota = null;
let detected = null;
let weeklyLimitHitAt = null;
let tab = null;

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/* ---------------- init ---------------- */

init();

async function init() {
  const store = await chrome.storage.local.get(['settings', 'run', 'history', 'noteQuota', 'detected', 'weeklyLimitHitAt']);
  settings = { ...DEFAULTS, ...(store.settings || {}) };
  // Drop settings from older versions (manual mode, pacing and caps).
  for (const k of ['mode', 'allPages', 'minDelay', 'maxDelay', 'perRunCap', 'weeklyCap', 'freeNotesPerMonth', 'maxPages']) delete settings[k];
  weeklyLimitHitAt = store.weeklyLimitHitAt || null;
  detected = store.detected || null;
  run = store.run || null;
  history = store.history || [];
  noteQuota = store.noteQuota || null;

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  fillForm();
  bind();
  renderAll();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.run) run = changes.run.newValue || null;
    if (changes.history) history = changes.history.newValue || [];
    if (changes.noteQuota) noteQuota = changes.noteQuota.newValue || null;
    if (changes.detected) detected = changes.detected.newValue || null;
    if (changes.weeklyLimitHitAt) weeklyLimitHitAt = changes.weeklyLimitHitAt.newValue || null;
    renderAll();
  });
  // Re-render every few seconds so a stalled run is detected.
  setInterval(renderRun, 3000);

  // Ask the LinkedIn tab to (re)check the account type in the background.
  if (tab && /^https:\/\/www\.linkedin\.com\//.test(tab.url || '')) {
    ensureContentScript()
      .then(() => chrome.tabs.sendMessage(tab.id, { type: 'DETECT', force: true }))
      .catch(e => { if (e && e.message === 'stale') showStale(); });
  }
}

function fillForm() {
  $('note').value = settings.note;
  $('shortNote').value = settings.shortNote;
  $('fallback').value = settings.freeFallback;
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ settings }), 250);
}

function bind() {
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    settings.modeChoice = b.dataset.mode;
    save(); renderAll();
  }));

  $('note').addEventListener('input', () => { settings.note = $('note').value; save(); renderNote(); });

  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const ta = $('note');
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + c.dataset.insert + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + c.dataset.insert.length;
    settings.note = ta.value; save(); renderNote();
  }));

  $('shortNote').addEventListener('input', () => { settings.shortNote = $('shortNote').value; save(); renderNote(); });
  $('fallback').addEventListener('change', () => { settings.freeFallback = $('fallback').value; save(); });


  $('startBtn').addEventListener('click', () => begin('START'));
  $('scanBtn').addEventListener('click', () => begin('SCAN'));
  $('stopBtn').addEventListener('click', stop);
  $('exportBtn').addEventListener('click', exportCsv);
  $('clearHistory').addEventListener('click', async () => {
    if (!confirm('Reset the weekly and monthly counters and delete the activity history stored by this extension?')) return;
    await chrome.storage.local.remove(['history', 'noteQuota', 'run', 'weeklyLimitHitAt']);
  });
}

/* ---------------- account type & limits ---------------- */

const effMode = () => NOTE.effectiveMode(settings, detected);
const limitNow = () => NOTE.limitFor(effMode(), detected);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* ---------------- counters ---------------- */

// Typical weekly limit for the account type in effect (detected in Auto, or chosen).
function weeklyLimit() {
  return WEEKLY_LIMITS[effMode()] || WEEKLY_LIMITS.free;
}
function weeklySent() {
  const since = Date.now() - WEEK;
  return history.filter(h => h.result === 'sent' && h.t >= since).length;
}
function freeNotesLeft() {
  const m = monthKey();
  const used = history.filter(h => h.result === 'sent' && h.withNote && monthKey(new Date(h.t)) === m).length;
  // Exact when LinkedIn has told us; otherwise an estimate (null = unknown).
  if (noteQuota && noteQuota.month === m) {
    if (noteQuota.exhausted) return { left: 0, exact: true };
    if (noteQuota.reportedLeft != null) return { left: noteQuota.reportedLeft, exact: true };
  }
  return { left: Math.max(0, TYPICAL_FREE_NOTES - used), exact: false };
}
function isActive() {
  return !!run && ACTIVE.includes(run.status) && Date.now() - (run.heartbeat || 0) < STALE_MS;
}

/* ---------------- rendering ---------------- */

function renderAll() {
  renderMode();
  renderNote();
  renderBanner();
  renderRun();
}

function renderMode() {
  document.querySelectorAll('.seg button').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.modeChoice)));
  const mode = effMode();
  const free = mode === 'free';
  const limit = limitNow();
  const lim = detected && detected.limits && detected.limits[mode];

  // Detection status line.
  const line = $('detectLine');
  line.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const txt = document.createElement('span');
  const known = detected && detected.premium !== null && detected.premium !== undefined;
  const detectedName = known ? (detected.premium ? 'Premium' : 'Free') : null;
  if (settings.modeChoice === 'auto') {
    if (known) { dot.classList.add('on'); txt.textContent = `Detected: ${detectedName} account`; }
    else { dot.classList.add('warn'); txt.textContent = 'Not detected yet. Using Free until LinkedIn is open and signed in.'; }
  } else if (known && detectedName.toLowerCase() !== settings.modeChoice) {
    dot.classList.add('warn');
    txt.textContent = `LinkedIn shows a ${detectedName} account. Switch to Auto to follow it.`;
  } else {
    dot.classList.add('on');
    txt.textContent = `Using ${free ? 'Free' : 'Premium'} (set manually)`;
  }
  line.append(dot, txt);

  const limitSrc = lim && lim.seenAt ? `read from LinkedIn on ${fmtDate(lim.seenAt)}` : 'LinkedIn\'s usual limit; checked automatically on Preview and while sending';
  $('modeHint').textContent = (free
    ? `Notes up to ${limit} characters (${limitSrc}). Free accounts only get a few personalized notes a month; after that, invites go out without a note, or the run stops. You choose below.`
    : `Notes up to ${limit} characters (${limitSrc}). No monthly note cap. LinkedIn's weekly invitation limit still applies.`);
  $('freeBox').hidden = !free;
}

function setCount(el, text) {
  const limit = limitNow();
  const len = NOTE.previewLength(text);
  el.textContent = `${len} / ${limit}`;
  el.classList.toggle('over', len > limit);
  el.title = /\{/.test(text) ? 'Counted with a long sample name filled in' : '';
  return len > limit;
}

function renderNote() {
  const mainOver = setCount($('charCount'), settings.note);
  const shortOver = setCount($('shortCount'), settings.shortNote);
  const limit = limitNow();
  $('shortBox').hidden = !mainOver && !settings.shortNote.trim();
  const hint = $('lengthHint');
  hint.hidden = !mainOver;
  if (mainOver) {
    const hasShort = settings.shortNote.trim() && !shortOver;
    hint.textContent = `Your note is over ${limit} characters` +
      (effMode() === 'free' ? ` (the Free limit; Premium allows ${NOTE.limitFor('premium', detected)})` : '') + '. ' +
      (hasShort ? 'The short version below will be used instead.'
                : 'Add a short version below, or invites will go out without a note.');
  }
}

let stale = false;
function renderBanner() {
  if (stale) return; // the update banner stays until fixed
  const b = $('pageBanner');
  const onSearch = tab && SEARCH_RE.test(tab.url || '');
  if (onSearch) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = 'Open a LinkedIn People search (Search → People) in this tab, then reopen this popup.';
}

function renderRun() {
  const active = isActive();
  const r = run || {};
  const onSearch = tab && SEARCH_RE.test(tab.url || '');

  $('sSent').textContent = r.dryRun ? 0 : (r.sent || 0);
  $('sSkipped').textContent = r.skipped || 0;
  $('sFailed').textContent = r.failed || 0;

  const pct = r.total ? Math.round(((r.processed || 0) / r.total) * 100) : 0;
  $('bar').style.width = pct + '%';
  $('progressText').textContent = r.total
    ? `${r.processed || 0} of ${r.total} profiles${r.page > 1 ? ` · page ${r.page}` : ''}${r.dryRun ? ` · ${r.ready || 0} ready` : ''}`
    : 'Ready';
  $('weekText').textContent = `This week: ${weeklySent()} / ~${weeklyLimit()}`;

  let msg = r.message || '';
  const stale = run && ACTIVE.includes(run.status) && !active;
  if (stale) msg = 'The last run was interrupted (the tab was closed, reloaded, or navigated away).';
  const m = $('message');
  m.textContent = msg;
  m.classList.toggle('error', r.status === 'error' || r.status === 'stopped' && /limit|out of|no personalized/i.test(msg));

  $('startBtn').hidden = active;
  $('scanBtn').hidden = active;
  $('stopBtn').hidden = !active;
  $('stopBtn').disabled = r.status === 'stopping';
  $('stopBtn').textContent = r.status === 'stopping' ? 'Stopping…' : 'Stop';
  $('startBtn').disabled = !onSearch;
  $('scanBtn').disabled = !onSearch;

  renderLog(r.log || []);
  renderUsage();
}

function renderUsage() {
  const now = Date.now();
  const sent = history.filter(h => h.result === 'sent');
  const week = sent.filter(h => h.t >= now - WEEK).length;
  const today = sent.filter(h => new Date(h.t).toDateString() === new Date().toDateString()).length;
  const m = monthKey();
  const month = sent.filter(h => monthKey(new Date(h.t)) === m);
  const notes = month.filter(h => h.withNote).length;

  const cap = weeklyLimit();
  $('uWeek').textContent = week;
  $('uWeekCap').textContent = `/ ~${cap}`;
  $('uWeekHint').textContent = `about ${cap} a week is typical for ${effMode() === 'premium' ? 'Premium' : 'Free'} accounts`;
  const bar = $('uWeekBar');
  bar.style.width = Math.min(100, Math.round((week / cap) * 100)) + '%';
  bar.className = week >= cap ? 'over' : week >= cap * 0.8 ? 'high' : '';
  $('uToday').textContent = today;
  $('uMonth').textContent = month.length;
  $('uNotes').textContent = notes;

  const mode = effMode();
  if (mode === 'premium') $('uNotesLeft').textContent = 'Unlimited';
  else {
    const nl = freeNotesLeft();
    $('uNotesLeft').textContent = nl.exact ? `${nl.left} (from LinkedIn)` : `~${nl.left} (est.)`;
  }
  const lim = detected && detected.limits && detected.limits[mode];
  $('uNoteLen').textContent = `${limitNow()} chars${lim && lim.seenAt ? '' : ' (default)'}`;
  const known = detected && detected.premium !== null && detected.premium !== undefined;
  $('uAccount').textContent = (mode === 'premium' ? 'Premium' : 'Free') +
    (settings.modeChoice === 'auto' ? (known ? ' (detected)' : ' (assumed)') : ' (manual)');

  const hit = $('uWeeklyHit');
  if (weeklyLimitHitAt && now - weeklyLimitHitAt < WEEK) {
    hit.hidden = false;
    hit.textContent = `LinkedIn showed its weekly-limit warning on ${fmtDate(weeklyLimitHitAt)}. ` +
      `It usually lifts about a week later (around ${fmtDate(weeklyLimitHitAt + WEEK)}). Until then LinkedIn will refuse new invites.`;
  } else hit.hidden = true;
}

let lastLogKey = '';
function renderLog(log) {
  const key = log.length + ':' + (log.length ? log[log.length - 1].t : 0);
  if (key === lastLogKey) return;
  lastLogKey = key;
  const ol = $('log');
  ol.textContent = '';
  if (!log.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing yet. Open a People search, then press Preview or Send invites.';
    ol.append(li);
    return;
  }
  for (const e of [...log].reverse()) {
    const li = document.createElement('li');
    const a = document.createElement(e.url ? 'a' : 'span');
    a.textContent = e.name;
    if (e.url) { a.href = e.url; a.target = '_blank'; a.rel = 'noopener'; }
    const tag = document.createElement('span');
    tag.className = 'tag ' + e.result;
    tag.textContent = e.result;
    const d = document.createElement('span');
    d.className = 'detail';
    d.textContent = e.detail || '';
    li.append(a, tag, d);
    ol.append(li);
  }
}

/* ---------------- actions ---------------- */

function say(text, isError = true) {
  const m = $('message');
  m.textContent = text;
  m.classList.toggle('error', isError);
}

const BUILD = chrome.runtime.getManifest().version;

async function inject() {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selectors.js', 'note.js', 'content.js'] });
  return chrome.tabs.sendMessage(tab.id, { type: 'PING' });
}

// Makes sure the LinkedIn tab runs this version of Connecto's page script.
async function ensureContentScript() {
  let r = null;
  try { r = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }); } catch (_) { /* nothing listening */ }
  if (r && r.ok) {
    if (r.build === BUILD || r.busy) return r;
    // An older copy is still active in the tab. Adding a second copy next to
    // it could make both respond, so ask for a reload instead.
    throw new Error('stale');
  }
  r = await inject();
  if (!r || r.build !== BUILD) throw new Error('stale');
  return r;
}

function showStale() {
  stale = true;
  const b = $('pageBanner');
  b.hidden = false;
  b.textContent = '';
  b.append('This LinkedIn tab is running an older version of Connecto. ');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link';
  btn.textContent = 'Update now';
  btn.addEventListener('click', async () => {
    // Refresh the tab, then reload Connecto from disk (this closes the popup).
    try { await chrome.tabs.reload(tab.id); } catch (_) {}
    chrome.runtime.reload();
  });
  b.append(btn);
}

async function begin(type) {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !SEARCH_RE.test(tab.url || '')) { renderBanner(); return say('Open a LinkedIn People search results page first.'); }
  if (type === 'START') {
    const nl = freeNotesLeft();
    if (effMode() === 'free' && (settings.note.trim() || settings.shortNote.trim()) && nl.exact && nl.left <= 0 && settings.freeFallback === 'stop') {
      return say('No personalized notes left this month. Clear the note or switch "When notes run out" to "Send without a note".');
    }
  }
  try {
    const ping = await ensureContentScript();
    if (ping && ping.busy) return say('A run is already in progress in this tab.');
    await chrome.storage.local.set({ runTabId: tab.id });
    const r = await chrome.tabs.sendMessage(tab.id, { type, settings: { ...settings } });
    if (r && !r.ok) say(r.error || 'Could not start.');
    else say(type === 'SCAN' ? 'Scanning…' : 'Starting…', false);
  } catch (e) {
    if (e && e.message === 'stale') { showStale(); return say('Press "Update now" at the top, then open Connecto again.'); }
    say('Could not reach the page. Reload the LinkedIn tab and try again.');
  }
}

async function stop() {
  const { runTabId } = await chrome.storage.local.get('runTabId');
  $('stopBtn').disabled = true;
  $('stopBtn').textContent = 'Stopping…';
  try { await chrome.tabs.sendMessage(runTabId ?? tab.id, { type: 'STOP' }); }
  catch (_) {
    // Tab is gone; mark the run as stopped so the UI recovers.
    await chrome.storage.local.set({ run: { ...(run || {}), status: 'stopped', message: 'Stopped.' } });
  }
}

function exportCsv() {
  if (!history.length) return say('No history to export yet.', false);
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Name', 'Profile URL', 'Result', 'Detail', 'With note']];
  for (const h of history) rows.push([new Date(h.t).toISOString(), h.name, h.url, h.result, h.detail, h.withNote ? 'yes' : 'no']);
  const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `connecto-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
