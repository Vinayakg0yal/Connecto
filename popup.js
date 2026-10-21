/* Connecto popup. Settings + controls; live progress comes from chrome.storage ("run"). */
const NOTE = globalThis.CONNECTO_NOTE;
const MODES = globalThis.CONNECTO_MODES;
const DEFAULTS = {
  modeChoice: 'auto',
  runMode: 'safe',
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

// Ready-made notes. Each has a short version (fits Free's 200) and a long one (fits Premium's 300).
const TEMPLATES = [
  { id: 'job', label: 'Job hunt',
    short: "Hi {firstName}, I'm exploring new roles and admire the work your team does. I'd love to connect and hear about any openings that might fit my background. Thank you!",
    long: "Hi {firstName}, I'm currently exploring new opportunities and really admire the work your team is doing. I'd love to connect and learn more about the team, and about any openings that might fit my background. I'd be grateful for any advice. Thank you for your time!" },
  { id: 'cold', label: 'Cold',
    short: "Hi {firstName}, I came across your profile and liked what you're working on. I'd love to connect and exchange ideas. Looking forward to staying in touch!",
    long: "Hi {firstName}, I came across your profile and really liked what you're working on. I'm always keen to learn from people in the field, so I'd love to connect and exchange ideas when you have a moment. Looking forward to staying in touch!" },
  { id: 'recruiter', label: 'Recruiter',
    short: "Hi {firstName}, I see you recruit in my field. I'm open to new opportunities and would love to connect in case a role comes up that fits my experience. Thanks!",
    long: "Hi {firstName}, I noticed you recruit for roles in my field. I'm open to new opportunities and would love to connect so you can keep me in mind if something fits my experience. Happy to share my resume anytime. Thanks so much!" },
  { id: 'referral', label: 'Referral',
    short: "Hi {firstName}, I'm interested in roles at your company and would really value your perspective on the team. Would you be open to connecting? Thank you!",
    long: "Hi {firstName}, I'm very interested in joining your company and would really value an insider's perspective on the team and culture. Would you be open to connecting, and maybe a quick chat sometime? I'd be grateful for any advice. Thank you!" },
  { id: 'network', label: 'Network',
    short: "Hi {firstName}, we work in the same space and I'd love to grow my network with people like you. Happy to connect!",
    long: "Hi {firstName}, we work in the same space and I enjoy connecting with people who share that interest. I'd love to add you to my network, swap ideas now and then, and help out where I can. Happy to connect!" }
];

let settings = { ...DEFAULTS };
let run = null;
let history = [];
let noteQuota = null;
let detected = null;
let weeklyLimitHitAt = null;
let weeklyLimitHow = null;
let tab = null;

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/* ---------------- init ---------------- */

init();

/* ---------------- update check ---------------- */
// Asks GitHub for the latest release (at most every 6 hours) and shows an
// "Update available" pill when it's newer than the installed version.
const RELEASES_API = 'https://api.github.com/repos/Vinayakg0yal/Connecto/releases/latest';
const RELEASES_PAGE = 'https://github.com/Vinayakg0yal/Connecto/releases/latest';
const UPDATE_TTL = 6 * 60 * 60 * 1000;

function newerVersion(a, b) { // true if version a > version b
  const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  const installed = chrome.runtime.getManifest().version;
  let { updateInfo } = await chrome.storage.local.get('updateInfo');
  if (!updateInfo || Date.now() - (updateInfo.checkedAt || 0) > UPDATE_TTL) {
    try {
      const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        updateInfo = { latest: String(j.tag_name || '').replace(/^v/i, ''), url: j.html_url || RELEASES_PAGE, checkedAt: Date.now() };
        await chrome.storage.local.set({ updateInfo });
      }
    } catch (_) { /* offline or rate-limited: try again next time */ }
  }
  const pill = $('updatePill');
  if (updateInfo && updateInfo.latest && newerVersion(updateInfo.latest, installed)) {
    pill.hidden = false;
    pill.textContent = `Update to v${updateInfo.latest}`;
    pill.title = `You have v${installed}. Download v${updateInfo.latest}, replace the files in your Connecto folder, then press ↻ on Connecto in chrome://extensions.`;
    pill.onclick = () => { chrome.tabs.create({ url: updateInfo.url || RELEASES_PAGE }); window.close(); };
  } else pill.hidden = true;
}

async function init() {
  const store = await chrome.storage.local.get(['settings', 'run', 'history', 'noteQuota', 'detected', 'weeklyLimitHitAt', 'weeklyLimitHow']);
  settings = { ...DEFAULTS, ...(store.settings || {}) };
  // Drop settings from older versions (manual mode, pacing and caps).
  for (const k of ['mode', 'allPages', 'minDelay', 'maxDelay', 'perRunCap', 'weeklyCap', 'freeNotesPerMonth', 'maxPages']) delete settings[k];
  weeklyLimitHitAt = store.weeklyLimitHitAt || null;
  weeklyLimitHow = store.weeklyLimitHow || null;
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
    if (changes.weeklyLimitHow) weeklyLimitHow = changes.weeklyLimitHow.newValue || null;
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
  document.querySelectorAll('.seg button[data-mode]').forEach(b => b.addEventListener('click', () => {
    settings.modeChoice = b.dataset.mode;
    save(); renderAll();
  }));
  document.querySelectorAll('.seg button[data-run]').forEach(b => b.addEventListener('click', () => {
    const next = b.dataset.run;
    if (next === settings.runMode) return;
    if (next === 'crazy' && !confirm(
      'Turn on Crazy mode?\n\n' +
      'No delays and no limits: Connecto sends invites back to back until LinkedIn refuses them.\n\n' +
      'LinkedIn does not allow bots or automated tools that send connection requests. ' +
      'Abusing this can get your account restricted or permanently banned.\n\n' +
      'Use it at your own risk.')) return;
    settings.runMode = next;
    save(); renderAll();
  }));

  $('note').addEventListener('input', () => { settings.note = $('note').value; save(); renderNote(); });

  document.querySelectorAll('.chip[data-insert]').forEach(c => c.addEventListener('click', () => {
    const ta = $('note');
    const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + c.dataset.insert + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + c.dataset.insert.length;
    settings.note = ta.value; save(); renderNote();
  }));

  // Templates: one compact row of pills under the note.
  const row = $('tplRow');
  for (const t of TEMPLATES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tpl'; b.dataset.tpl = t.id; b.textContent = t.label;
    b.addEventListener('click', () => useTemplate(t));
    row.append(b);
  }
  $('tplToggle').addEventListener('click', () => {
    const open = row.hidden;
    row.hidden = !open;
    $('tplToggle').setAttribute('aria-expanded', String(open));
  });

  $('shortNote').addEventListener('input', () => { settings.shortNote = $('shortNote').value; save(); renderNote(); });
  $('fallback').addEventListener('change', () => { settings.freeFallback = $('fallback').value; save(); });


  $('startBtn').addEventListener('click', () => begin('START'));
  $('scanBtn').addEventListener('click', () => begin('SCAN'));
  $('stopBtn').addEventListener('click', stop);
  $('exportBtn').addEventListener('click', exportCsv);
  $('clearHistory').addEventListener('click', async () => {
    if (!confirm('Reset the weekly and monthly counters and delete the activity history stored by this extension?')) return;
    await chrome.storage.local.remove(['history', 'noteQuota', 'run', 'weeklyLimitHitAt', 'weeklyLimitHow']);
  });
}

// Fills the note with a template: the long version if it fits the current
// limit, otherwise the short one. Asks before replacing a note you wrote.
function useTemplate(t) {
  const ta = $('note');
  const current = ta.value.trim();
  const isTemplate = TEMPLATES.some(x => x.short === current || x.long === current);
  if (current && !isTemplate && !confirm('Replace your note with the "' + t.label + '" template?')) return;
  const text = NOTE.previewLength(t.long) <= limitNow() ? t.long : t.short;
  ta.value = text;
  settings.note = text; save(); renderNote();
  document.querySelectorAll('#tplRow .tpl').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tpl === t.id)));
  ta.scrollTop = 0;
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

// Safe-mode caps for the account type in effect.
function safeCaps() {
  const m = effMode();
  return { day: MODES.SAFE.daily[m] || MODES.SAFE.daily.free, week: MODES.SAFE.weekly[m] || MODES.SAFE.weekly.free };
}

function renderRunMode() {
  const rm = MODES.runMode(settings);
  document.querySelectorAll('.seg button[data-run]').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.run === rm)));
  const S = MODES.SAFE, c = safeCaps();
  const acct = effMode() === 'premium' ? 'Premium' : 'Free';
  $('runHint').textContent = rm === 'safe'
    ? `Paced like a person, with ${S.inviteDelay[0]}–${S.inviteDelay[1]} s between invites. Stops at ${c.day} a day and ${c.week} a week (${acct}).`
    : 'No delays and no limits. Runs until LinkedIn stops it.';
  $('crazyWarn').hidden = rm !== 'crazy';
  document.body.classList.toggle('crazy', rm === 'crazy');
}

function renderMode() {
  document.querySelectorAll('.seg button[data-mode]').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.modeChoice)));
  renderRunMode();
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
    ? `Notes up to ${limit} characters. Free accounts get a few personalized notes a month.`
    : `Notes up to ${limit} characters, no monthly cap.`);
  $('modeHint').title = limitSrc;
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
  b.className = 'banner start';
  b.textContent = '';
  const p = document.createElement('p');
  p.textContent = 'Connecto works on a LinkedIn People search.';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn primary go';
  go.textContent = 'Go to LinkedIn search';
  go.addEventListener('click', openSearch);
  const small = document.createElement('small');
  small.textContent = 'Search for anyone (for example "recruiter"), then open Connecto again.';
  b.append(p, go, small);
}

// Opens LinkedIn's People search: in this tab if it's already LinkedIn or a
// new-tab page, otherwise (including when the tab's address is unknown) in a new tab.
const PEOPLE_SEARCH_URL = 'https://www.linkedin.com/search/results/people/';
async function openSearch() {
  const url = (tab && (tab.url || tab.pendingUrl)) || '';
  const reuse = !!url && (/^https:\/\/([a-z]+\.)?linkedin\.com\//.test(url) || /^(chrome|edge|brave):\/\/newtab|^about:blank$/.test(url));
  try {
    if (reuse) await chrome.tabs.update(tab.id, { url: PEOPLE_SEARCH_URL });
    else await chrome.tabs.create({ url: PEOPLE_SEARCH_URL });
  } catch (_) {
    await chrome.tabs.create({ url: PEOPLE_SEARCH_URL });
  }
  window.close();
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
  const safe = MODES.runMode(settings) === 'safe';
  $('uModeNote').textContent = safe
    ? 'Safe mode stops on its own at its daily and weekly limits.'
    : 'Crazy mode: these numbers are for information only; nothing slows down.';
  $('uSafeWrap').hidden = !safe;
  if (safe) {
    const c = safeCaps();
    $('uSafeLeft').textContent = `${Math.max(0, c.day - today)} today · ${Math.max(0, c.week - week)} this week`;
  }
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
    const how = weeklyLimitHow === 'refused'
      ? `LinkedIn stopped accepting invites on ${fmtDate(weeklyLimitHitAt)} (they came back as "Connect again")`
      : `LinkedIn showed its weekly-limit warning on ${fmtDate(weeklyLimitHitAt)}`;
    hit.textContent = `You're done for this week. ${how}. ` +
      `New invites should work again around ${fmtDate(weeklyLimitHitAt + WEEK)}. Until then Connecto stops at the first refused invite.`;
  } else hit.hidden = true;
}

let lastLogKey = '';
function renderLog(log) {
  const key = log.length + ':' + (log.length ? log[log.length - 1].t : 0);
  if (key === lastLogKey) return;
  lastLogKey = key;
  const ol = $('log');
  ol.textContent = '';
  $('logCount').textContent = log.length ? String(log.length) : '';
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
  b.className = 'banner';
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

checkForUpdate();
