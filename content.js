/*
 * Connecto content script.
 * Runs inside linkedin.com tabs. Finds the result cards on a People search
 * page, then (only when the popup says so) works through them one at a time.
 * Progress is written to chrome.storage.local under "run", which the popup
 * watches.
 */
(() => {
  // Load once per version, so an updated Connecto replaces an older copy
  // that is still sitting in an open tab.
  const BUILD = chrome.runtime.getManifest().version;
  if (globalThis.__connectoLoaded === BUILD) return;
  globalThis.__connectoLoaded = BUILD;

  const S = globalThis.CONNECTO_SEL;
  const NOTE = globalThis.CONNECTO_NOTE;
  const LOG_MAX = 300;
  const HISTORY_MAX = 5000;

  let state = idleState();
  let stopRequested = false;
  let busy = false;
  let lastPush = 0;

  function idleState() {
    return {
      status: 'idle', sent: 0, skipped: 0, failed: 0, ready: 0,
      total: 0, processed: 0, log: [], message: '', heartbeat: Date.now()
    };
  }

  class StopRun extends Error {
    constructor(message) { super(message); this.name = 'StopRun'; }
  }

  /* ---------------- small utilities ---------------- */

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => Math.round(a + Math.random() * (b - a));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  const labelOf = el => norm(el.getAttribute('aria-label'));
  const textOf = el => norm(el && (el.innerText || el.textContent));
  function matches(el, pats) {
    const l = labelOf(el), t = textOf(el);
    return pats.some(p => (l && p.test(l)) || (t && p.test(t)));
  }
  function clickables(root) {
    return [...root.querySelectorAll('button, a, [role="button"]')].filter(visible);
  }
  function findBtn(root, pats) {
    if (!root) return null;
    return clickables(root).find(el => matches(el, pats)) || null;
  }
  const enabled = b => !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';

  async function push(force = true) {
    if (!force && Date.now() - lastPush < 1500) return;
    lastPush = Date.now();
    state.heartbeat = Date.now();
    try { await chrome.storage.local.set({ run: state }); } catch (_) { /* extension reloaded */ }
  }

  async function waitFor(fn, timeout = 8000, interval = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const r = fn();
      if (r) return r;
      push(false);
      await sleep(interval);
    }
    return null;
  }


  const isSearchPage = () => location.pathname.startsWith('/search/results/people');

  // Waits ms with a countdown in the popup; returns false early if Stop was pressed.
  async function pause(ms, label) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (stopRequested) return false;
      if (label) state.message = `${label} ${Math.ceil((end - Date.now()) / 1000)}s…`;
      await push();
      await sleep(Math.min(1000, Math.max(0, end - Date.now())));
    }
    return !stopRequested;
  }
  const secs = ([a, b]) => rand(a * 1000, b * 1000);

  /* ---------------- storage helpers ---------------- */

  async function getStore(keys) {
    try { return await chrome.storage.local.get(keys); } catch (_) { return {}; }
  }
  async function addHistory(entry) {
    const { history = [] } = await getStore('history');
    history.push(entry);
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    try { await chrome.storage.local.set({ history }); } catch (_) {}
  }
  async function getNoteQuota() {
    const { noteQuota } = await getStore('noteQuota');
    if (!noteQuota || noteQuota.month !== monthKey()) return { month: monthKey(), exhausted: false, reportedLeft: null };
    return noteQuota;
  }
  async function setNoteQuota(patch) {
    const q = Object.assign(await getNoteQuota(), patch);
    try { await chrome.storage.local.set({ noteQuota: q }); } catch (_) {}
  }

  /* ---------------- reading the search page ---------------- */

  const slugOf = a => {
    try { return (new URL(a.href, location.href).pathname.match(/^\/in\/([^/]+)/) || [])[1] || null; }
    catch (_) { return null; }
  };

  function findCards() {
    const main = document.querySelector('main') || document.body;
    for (const sel of S.resultCards) {
      const els = [...main.querySelectorAll(sel)].filter(el =>
        [...el.querySelectorAll('a[href*="/in/"]')].some(slugOf));
      if (els.length) return els.filter(el => !els.some(o => o !== el && o.contains(el)));
    }
    // Heuristic: climb from each profile link to the largest ancestor that
    // still only refers to that one person.
    const cards = [];
    const seen = new Set();
    for (const a of main.querySelectorAll('a[href*="/in/"]')) {
      const slug = slugOf(a);
      if (!slug) continue;
      let el = a;
      while (el.parentElement && el.parentElement !== main) {
        const p = el.parentElement;
        const slugs = new Set([...p.querySelectorAll('a[href*="/in/"]')].map(slugOf).filter(Boolean));
        if (slugs.size > 1) break;
        el = p;
      }
      if (seen.has(el)) continue;
      if (!clickables(el).some(b => b.tagName === 'BUTTON' || b.getAttribute('aria-label'))) continue;
      seen.add(el);
      cards.push(el);
    }
    return cards.filter(el => !cards.some(o => o !== el && o.contains(el)));
  }

  function cardInfo(card) {
    const links = [...card.querySelectorAll('a[href*="/in/"]')].filter(slugOf);
    const link = links.find(a => textOf(a)) || links[0];
    const url = link ? new URL(link.href, location.href).origin + new URL(link.href, location.href).pathname : '';

    const ctrls = clickables(card);
    const find = pats => ctrls.find(el => matches(el, pats)) || null;
    const pending = find(S.label.pending);
    const connectAgain = pending ? null : find(S.label.connectAgain || []);
    const connect = pending || connectAgain ? null : find(S.label.connect);
    const message = find(S.label.message);
    const follow = find(S.label.follow);

    let name = '';
    const lbl = [connect, pending, message, follow].filter(Boolean).map(labelOf).find(Boolean) || '';
    const m = lbl.match(/^invite (.+) to connect$/i) || lbl.match(/invitation sent to (.+)$/i) ||
              lbl.match(/^message (.+)$/i) || lbl.match(/^follow (.+)$/i);
    if (m) name = m[1];
    if (!name && link) {
      const span = link.querySelector('span[aria-hidden="true"]');
      name = (textOf(span || link).split(/\n| • /)[0] || '')
        .replace(/^view\s+/i, '').replace(/['’]s?\s+profile.*$/i, '');
    }
    name = norm(name) || 'Unknown';

    const firstDegree = /(^|\s|•)\s*1st\b/.test(textOf(card).slice(0, 500));
    let kind = 'skip', reason = '';
    if (pending) reason = 'Invitation already pending';
    else if (connectAgain) reason = 'LinkedIn refused an earlier invite ("Connect again")';
    else if (connect) kind = 'connect';
    else if (firstDegree) reason = 'Already connected';
    else if (message) reason = 'Message only (connected or open profile)';
    else if (follow) reason = 'Connect not offered here (Follow only)';
    else reason = 'No Connect button';
    return { name, url, kind, reason, control: connect, connectAgain: !!connectAgain };
  }

  async function loadAllResults() {
    const scroller = document.scrollingElement || document.documentElement;
    for (let i = 1; i <= 6; i++) {
      window.scrollTo({ top: (scroller.scrollHeight * i) / 6, behavior: 'smooth' });
      await sleep(400);
    }
    const cards = findCards();
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end' });
    await sleep(700);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await sleep(400);
  }

  /* ---------------- dialogs ---------------- */

  let shadowCache = { t: 0, roots: [] };
  function roots() {
    if (Date.now() - shadowCache.t > 1500) {
      const hosts = new Set();
      for (const sel of S.shadowHosts) document.querySelectorAll(sel).forEach(h => h.shadowRoot && hosts.add(h));
      for (const el of document.querySelectorAll('body *')) if (el.shadowRoot) hosts.add(el);
      shadowCache = { t: Date.now(), roots: [...hosts].map(h => h.shadowRoot) };
    }
    return [document, ...shadowCache.roots];
  }

  function allDialogs() {
    const found = [];
    for (const r of roots()) {
      r.querySelectorAll(S.dialog).forEach(d => {
        if (visible(d) && !d.closest(S.dialogIgnore) && d.querySelector('button')) found.push(d);
      });
    }
    return found.filter(d => !found.some(o => o !== d && o.contains(d)));
  }
  const newDialog = before => allDialogs().filter(d => !before.has(d)).pop() || null;

  function noteField(d) {
    if (!d) return null;
    return [...d.querySelectorAll(S.noteField)].find(visible) || null;
  }

  function dialogKind(d) {
    const t = textOf(d);
    if (S.text.weeklyLimit.some(p => p.test(t))) return 'weekly';
    if (d.querySelector('input[type="email"]') || S.text.emailRequired.some(p => p.test(t))) return 'email';
    if (!noteField(d) && !findBtn(d, S.modalButtons.addNote) &&
        S.text.noteLimit.some(p => p.test(t)) && S.text.noteLimitHint.some(p => p.test(t))) return 'noteLimit';
    return 'invite';
  }

  function readNotesLeft(d) {
    const m = textOf(d).match(S.text.notesLeft);
    if (m) setNoteQuota({ reportedLeft: parseInt(m[1], 10) });
  }

  async function closeDialog(d) {
    if (!d || !visible(d)) return;
    const b = findBtn(d, S.modalButtons.dismiss);
    if (b) b.click();
    else {
      const esc = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true };
      d.dispatchEvent(new KeyboardEvent('keydown', esc));
      document.dispatchEvent(new KeyboardEvent('keydown', esc));
    }
    await waitFor(() => !visible(d), 3000, 150);
  }

  async function closeAll(before) {
    for (let i = 0; i < 4; i++) {
      const d = newDialog(before);
      if (!d) return;
      const discard = findBtn(d, S.modalButtons.discard);
      if (discard) { discard.click(); await sleep(400); continue; }
      await closeDialog(d);
      await sleep(300);
    }
  }

  function typeInto(field, text) {
    field.focus();
    try {
      field.select();
      document.execCommand('insertText', false, text);
    } catch (_) {}
    if (norm(field.value) !== norm(text)) {
      const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, text);
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function refreshCard(card, url) {
    if (card && card.isConnected) return card;
    if (!url) return null;
    return findCards().find(c => cardInfo(c).url === url) || null;
  }

  // One entry per person on the page (deduplicated by profile URL).
  function snapshot() {
    const seen = new Set();
    const out = [];
    for (const card of findCards()) {
      const i = cardInfo(card);
      const key = i.url || card;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ card, url: i.url, name: i.name });
    }
    return out;
  }
  async function becamePending(card, url, ms) {
    return !!(await waitFor(() => {
      const c = refreshCard(card, url);
      if (!c) return false;
      const i = cardInfo(c);
      return i.kind === 'skip' && /pending/i.test(i.reason);
    }, ms, 300));
  }

  /* ---------------- account type & note limit detection ---------------- */

  const ACCOUNT_TTL = 6 * 60 * 60 * 1000;     // re-check Premium every 6 hours
  const LIMIT_TTL = 7 * 24 * 60 * 60 * 1000;  // re-read the note limit weekly

  async function getDetected() {
    const { detected } = await getStore('detected');
    return Object.assign({ premium: null, premiumSource: null, checkedAt: 0, limits: {} }, detected || {});
  }
  async function saveDetected(d) {
    try { await chrome.storage.local.set({ detected: d }); } catch (_) {}
  }

  function findKey(o, key, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 6) return undefined;
    if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    for (const v of Object.values(o)) {
      const r = findKey(v, key, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  // 1st choice: the same account endpoint LinkedIn's page uses.
  async function premiumFromAccount() {
    try {
      const m = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
      if (!m) return null;
      const r = await fetch(S.account.apiUrl, {
        credentials: 'include',
        headers: { 'csrf-token': m[1], accept: 'application/json', 'x-restli-protocol-version': '2.0.0' }
      });
      if (!r.ok) return null;
      const v = findKey(await r.json(), S.account.apiPremiumKey);
      return typeof v === 'boolean' ? v : null;
    } catch (_) { return null; }
  }

  // 2nd choice: what the top navigation bar offers.
  function premiumFromPage() {
    const nav = document.querySelector(S.account.navArea);
    if (!nav) return null;
    const items = [...nav.querySelectorAll('a, button')];
    if (items.some(el => S.account.premiumHref.some(p => p.test(el.getAttribute('href') || '')) ||
                         S.account.premiumText.some(p => p.test(textOf(el))))) return true;
    if (items.some(el => S.account.freeText.some(p => p.test(textOf(el)) || p.test(labelOf(el))))) return false;
    return null;
  }

  async function detectAccount(force = false) {
    const d = await getDetected();
    if (!force && d.premium !== null && Date.now() - d.checkedAt < ACCOUNT_TTL) return d;
    let premium = await premiumFromAccount(), source = 'account';
    if (premium === null) { premium = premiumFromPage(); source = 'page'; }
    if (premium !== null) { d.premium = premium; d.premiumSource = source; }
    d.checkedAt = Date.now();
    await saveDetected(d);
    return d;
  }

  // Seeing LinkedIn's "out of personalized invitations" prompt means Free.
  async function markFreeIfUnknown() {
    const d = await getDetected();
    if (d.premium === null) { d.premium = false; d.premiumSource = 'upsell'; await saveDetected(d); }
  }

  // Reads the note limit from LinkedIn's note box (maxlength or "0/300").
  function readNoteLimit(d, field) {
    const ml = parseInt(field.getAttribute('maxlength'), 10);
    if (ml >= 50 && ml <= 5000) return ml;
    const m = textOf(d).match(S.text.charCounter);
    const n = m ? parseInt(m[1], 10) : NaN;
    return n >= 50 && n <= 5000 ? n : null;
  }

  async function recordLimit(mode, n) {
    const d = await getDetected();
    // File it under the real account type when known, so a wrong manual
    // choice doesn't pollute the other mode's limit.
    const key = d.premium === true ? 'premium' : d.premium === false ? 'free' : mode;
    const prev = d.limits[key] && d.limits[key].value;
    d.limits[key] = { value: n, seenAt: Date.now() };
    await saveDetected(d);
    return { key, changed: prev != null && prev !== n, prev };
  }

  // Works out mode + limit for this run from the user's choice and detection.
  async function resolveSettings(settings) {
    const d = await detectAccount(false);
    const mode = NOTE.effectiveMode(settings, d);
    return Object.assign({}, settings, { mode, limit: NOTE.limitFor(mode, d), detectedPremium: d.premium });
  }

  // Opens one invite dialog, presses "Add a note", reads the limit, and
  // closes everything again. Nothing is sent.
  async function probeLimit(card, info, mode) {
    const before = new Set(allDialogs());
    info.control.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(rand(500, 900));
    info.control.click();
    const dlg = await waitFor(() => newDialog(before), 8000);
    if (!dlg) return null;
    await sleep(rand(400, 800));
    let lim = null;
    try {
      if (dialogKind(dlg) !== 'invite') return null;
      readNotesLeft(dlg);
      if (!noteField(dlg)) {
        const add = findBtn(dlg, S.modalButtons.addNote);
        if (add) add.click();
      }
      const step = await waitFor(() => {
        const d = newDialog(before);
        if (!d) return null;
        const f = noteField(d);
        if (f) return { d, f };
        return dialogKind(d) === 'noteLimit' ? { d, k: 'noteLimit' } : null;
      }, 6000);
      if (step && step.k === 'noteLimit') {
        await setNoteQuota({ exhausted: true, reportedLeft: 0 });
        await markFreeIfUnknown();
      } else if (step) {
        readNotesLeft(step.d);
        lim = readNoteLimit(step.d, step.f);
        if (lim) await recordLimit(mode, lim);
      }
    } finally {
      await closeAll(before);
    }
    return lim;
  }

  /* ---------------- sending one invitation ---------------- */

  const fail = detail => ({ result: 'failed', detail });

  function noteLimitOutcome(opt) {
    if (opt.freeFallback === 'stop') {
      return {
        result: 'skipped', detail: 'No personalized notes left', noteLimitHit: true,
        stop: 'You are out of personalized notes for this month. Stopped, as set in your options.'
      };
    }
    return { retryWithoutNote: true, noteLimitHit: true };
  }

  // Weekly-limit wording in a toast/alert at the edge of the page.
  function weeklyToast() {
    const roots = [document, ...S.shadowHosts.map(h => document.querySelector(h)).filter(Boolean).map(h => h.shadowRoot || h)];
    for (const r of roots) {
      for (const el of r.querySelectorAll(S.toast)) {
        const t = textOf(el);
        if (t && S.text.weeklyLimit.some(p => p.test(t))) return true;
      }
    }
    return false;
  }

  const WEEKLY_STOP = 'LinkedIn says you have reached the weekly invitation limit. Stopped.';
  const weeklyFail = () => ({ result: 'failed', detail: 'LinkedIn weekly invitation limit reached', stop: WEEKLY_STOP, weekly: true });

  async function confirmSent(card, info, before, withNote) {
    const out = await waitFor(() => {
      const d = newDialog(before);
      if (!d) return 'closed';
      const k = dialogKind(d);
      if (k === 'weekly' || k === 'email') return k;
      return null;
    }, 8000);
    if (out === 'weekly') {
      await closeAll(before);
      return weeklyFail();
    }
    if (out === 'email') {
      await closeAll(before);
      return { result: 'skipped', detail: 'LinkedIn requires their email address' };
    }
    if (!out) {
      const d = newDialog(before);
      const stillInvite = d && (noteField(d) || findBtn(d, S.modalButtons.send) || findBtn(d, S.modalButtons.sendWithoutNote));
      await closeAll(before);
      if (stillInvite) return fail('Invite dialog did not close after Send');
    }
    // Watch for the card to flip to "Pending", while also catching limit
    // warnings that LinkedIn shows a moment after the invite dialog closes.
    // If LinkedIn silently refuses the invite (its weekly limit), the card
    // flips to "Connect again" or back to "Connect" instead of "Pending".
    const after = await waitFor(() => {
      const d = newDialog(before);
      if (d && dialogKind(d) === 'weekly') return 'weekly';
      if (weeklyToast()) return 'weekly';
      const c = refreshCard(card, info.url);
      if (c) {
        const i = cardInfo(c);
        if (i.kind === 'skip' && /pending/i.test(i.reason)) return 'pending';
        if (i.connectAgain) return 'refused';
      }
      return null;
    }, 6000, 300);
    if (after === 'weekly') {
      await closeAll(before);
      return weeklyFail();
    }
    const lateDialog = newDialog(before);
    if (lateDialog) await closeAll(before);
    let refused = after === 'refused';
    if (!after) {
      // Not Pending after 6 s: if the Connect button is back, it wasn't sent.
      const c = refreshCard(card, info.url);
      const i = c && cardInfo(c);
      if (i && (i.kind === 'connect' || i.connectAgain)) refused = true;
    }
    if (refused) {
      return { result: 'failed', detail: 'Not sent: LinkedIn put the Connect button back ("Connect again")', refused: true, withNote: false };
    }
    return { result: 'sent', detail: (withNote ? 'Sent with note' : 'Sent without note') + (after === 'pending' ? '' : ' (unverified)'), withNote };
  }

  async function attempt(card, info, text, opt) {
    const before = new Set(allDialogs());
    info.control.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(rand(500, 1000));
    info.control.click();

    const dlg = await waitFor(() => newDialog(before), 8000);
    if (!dlg) {
      if (await becamePending(card, info.url, 2500)) return { result: 'sent', detail: 'Sent without note (no dialog shown)', withNote: false };
      return fail('Invite dialog did not open');
    }
    await sleep(rand(500, 900));

    const kind = dialogKind(dlg);
    if (kind === 'weekly') {
      await closeAll(before);
      return weeklyFail();
    }
    if (kind === 'email') { await closeAll(before); return { result: 'skipped', detail: 'LinkedIn requires their email address' }; }
    if (kind === 'noteLimit' && text) {
      const swn = findBtn(dlg, S.modalButtons.sendWithoutNote);
      const o = noteLimitOutcome(opt);
      if (o.retryWithoutNote && enabled(swn)) {
        swn.click();
        return Object.assign(await confirmSent(card, info, before, false), { noteLimitHit: true });
      }
      await closeAll(before);
      return o;
    }

    if (!text) {
      const b = findBtn(dlg, S.modalButtons.sendWithoutNote) || findBtn(dlg, S.modalButtons.send);
      if (!enabled(b)) { await closeAll(before); return fail('Could not find the Send button'); }
      b.click();
      return confirmSent(card, info, before, false);
    }

    // With a note.
    readNotesLeft(dlg);
    if (!noteField(dlg)) {
      const add = findBtn(dlg, S.modalButtons.addNote);
      if (add) { add.click(); await sleep(rand(400, 800)); }
    }
    const step = await waitFor(() => {
      const d = newDialog(before);
      if (!d) return null;
      const f = noteField(d);
      if (f) return { d, f };
      const k = dialogKind(d);
      return (k === 'noteLimit' || k === 'weekly') ? { d, k } : null;
    }, 6000);

    if (!step) { await closeAll(before); return fail('Could not open the note box'); }
    if (step.k === 'weekly') {
      await closeAll(before);
      return weeklyFail();
    }
    if (step.k === 'noteLimit') {
      await setNoteQuota({ exhausted: true, reportedLeft: 0 });
      const o = noteLimitOutcome(opt);
      const swn = findBtn(step.d, S.modalButtons.sendWithoutNote);
      if (o.retryWithoutNote && enabled(swn)) {
        swn.click();
        return Object.assign(await confirmSent(card, info, before, false), { noteLimitHit: true });
      }
      await closeAll(before);
      return o;
    }

    readNotesLeft(step.d);
    let noteWhich = null;
    const lim = readNoteLimit(step.d, step.f);
    if (lim) {
      await recordLimit(opt.mode, lim);
      if (text.length > lim) {
        // LinkedIn's limit is lower than we assumed: re-pick with the real one.
        const p = NOTE.pick(Object.assign({}, opt, { limit: lim }), info.name);
        if (!p.text) { await closeAll(before); return { retryWithoutNote: true, noteWhich: 'tooLong' }; }
        text = p.text;
        noteWhich = p.which;
      }
    }
    typeInto(step.f, text);
    await sleep(rand(700, 1400));
    if (norm(step.f.value) !== norm(text)) { await closeAll(before); return fail('Could not type the note'); }

    const sendBtn = await waitFor(() => {
      const b = findBtn(step.d, S.modalButtons.send);
      return enabled(b) ? b : null;
    }, 4000);
    if (!sendBtn) { await closeAll(before); return fail('Send button stayed disabled'); }
    sendBtn.click();
    return Object.assign(await confirmSent(card, info, before, true), noteWhich ? { noteWhich } : {});
  }

  async function sendInvite(card, info, opt) {
    const text = opt.useNote ? opt.noteText : '';
    const r = await attempt(card, info, text, opt);
    if (!r.retryWithoutNote) return r;

    // Out of notes: reopen the invite and send it without one.
    await sleep(rand(1200, 2200));
    const fresh = refreshCard(card, info.url);
    const carry = { noteLimitHit: !!r.noteLimitHit, noteWhich: r.noteWhich };
    if (!fresh) return Object.assign(fail('Result card disappeared'), carry);
    const again = cardInfo(fresh);
    if (again.kind !== 'connect') return Object.assign(fail('Connect button no longer available'), carry);
    const r2 = await attempt(fresh, again, '', opt);
    return Object.assign(r2, carry);
  }

  /* ---------------- runs ---------------- */

  function addLog(info, result, detail) {
    state.log.push({ t: Date.now(), name: info.name, url: info.url, result, detail });
    if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  }

  async function scan(settings) {
    busy = true; stopRequested = false;
    state = Object.assign(idleState(), { status: 'scanning', dryRun: true, message: 'Checking your account…' });
    await push();
    try {
      if (!isSearchPage()) throw new StopRun('Open a LinkedIn People search results page first.');
      await detectAccount(true);
      settings = await resolveSettings(settings);
      state.mode = settings.mode;
      state.message = 'Scanning this page…';
      await push();
      await loadAllResults();
      const queue = snapshot();
      if (!queue.length) throw new StopRun('No profiles found on this page. Scroll the results into view and try again.');

      // Re-read LinkedIn's note limit if we haven't seen it recently.
      const d = await getDetected();
      const known = d.limits[settings.mode];
      const hasNote = !!((settings.note || '').trim() || (settings.shortNote || '').trim());
      if (hasNote && (!known || Date.now() - known.seenAt > LIMIT_TTL)) {
        const first = queue.map(q => ({ q, i: cardInfo(q.card) })).find(x => x.i.kind === 'connect');
        if (first) {
          state.message = 'Reading the note limit from LinkedIn (nothing is sent)…';
          await push();
          const lim = await probeLimit(first.q.card, first.i, settings.mode);
          settings = await resolveSettings(settings);
          addLog({ name: 'Note limit check', url: '' }, 'info',
            lim ? `LinkedIn's note box allows ${lim} characters.` : 'Could not read the limit; using ' + settings.limit + '.');
        }
      }
      state.total = queue.length;
      for (const { card } of queue) {
        const info = cardInfo(card);
        if (info.kind === 'connect') {
          state.ready++;
          const p = NOTE.pick(settings, info.name);
          addLog(info, 'ready', p.text
            ? `Would invite with ${p.which === 'short' ? 'short ' : ''}note: "${p.text}"`
            : p.which === 'tooLong' ? 'Would invite without a note (note too long and no short version fits)' : 'Would invite without a note');
        } else {
          state.skipped++;
          addLog(info, 'skipped', info.reason);
        }
        state.processed++;
      }
      state.status = 'scanned';
      state.message = `Found ${queue.length} profiles: ${state.ready} can be invited, ${state.skipped} will be skipped. ` +
        `${settings.mode === 'premium' ? 'Premium' : 'Free'} account, ${settings.limit}-character notes.`;
    } catch (e) {
      state.status = e instanceof StopRun ? 'stopped' : 'error';
      state.message = e.message || String(e);
    } finally {
      busy = false;
      await push();
    }
  }

  const pageNum = () => parseInt(new URL(location.href).searchParams.get('page') || '1', 10);

  function findNextButton() {
    const main = document.querySelector('main') || document.body;
    return clickables(main).find(b => matches(b, S.pagination.next) && enabled(b)) || null;
  }

  // Clicks LinkedIn's "Next" button and waits for the new results to render.
  async function goNextPage() {
    window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'smooth' });
    await sleep(800);
    const btn = findNextButton();
    if (!btn) return false;
    const before = pageNum();
    const firstUrl = (snapshot()[0] || {}).url;
    btn.scrollIntoView({ block: 'center' });
    await sleep(rand(400, 900));
    btn.click();
    const ok = await waitFor(() => {
      if (pageNum() === before) return false;
      const q = snapshot();
      return q.length && q[0].url !== firstUrl;
    }, 15000, 500);
    if (!ok) return false;
    await sleep(rand(700, 1200)); // let the new results finish rendering
    return true;
  }

  // LinkedIn sometimes enforces its weekly limit silently: the invite bounces
  // back to "Connect again". Two in a row is treated as the weekly limit.
  const REFUSED_STOP = 2;

  // Records the weekly limit, shows a banner on the LinkedIn page, and returns
  // the message for the popup.
  async function weeklyLimitReached(mode, how) {
    const now = Date.now();
    try { await chrome.storage.local.set({ weeklyLimitHitAt: now, weeklyLimitHow: how }); } catch (_) {}
    const { history = [] } = await getStore('history');
    const week = history.filter(h => h.result === 'sent' && h.t >= now - 7 * 864e5).length;
    const typical = mode === 'premium' ? 200 : 100;
    const until = new Date(now + 7 * 864e5).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const why = how === 'refused'
      ? 'LinkedIn stopped accepting invites (the Connect button came back as "Connect again").'
      : 'LinkedIn showed its weekly invitation limit warning.';
    const msg = `You're done for this week. ${why} You've sent ${week} invite${week === 1 ? '' : 's'} in the last 7 days ` +
      `(typical ${mode === 'premium' ? 'Premium' : 'Free'} limit ~${typical}). ` +
      `LinkedIn won't accept more until the limit resets, around ${until}. Run stopped.`;
    showPageBanner(msg);
    return msg;
  }

  function showPageBanner(text) {
    try {
      document.getElementById('connecto-banner')?.remove();
      const b = document.createElement('div');
      b.id = 'connecto-banner';
      b.setAttribute('role', 'alert');
      b.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
        'max-width:560px;width:calc(100% - 32px);background:#0b1f2c;color:#fff;border-left:5px solid #f59e0b;' +
        'border-radius:10px;padding:14px 40px 14px 16px;font:14px/1.45 -apple-system,system-ui,sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25)';
      const title = document.createElement('strong');
      title.textContent = 'Connecto: weekly invitation limit reached';
      title.style.cssText = 'display:block;margin-bottom:4px;color:#fbbf24';
      const body = document.createElement('div');
      body.textContent = text;
      const x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', 'Dismiss');
      x.style.cssText = 'position:absolute;top:6px;right:10px;background:none;border:0;color:#fff;font-size:20px;cursor:pointer';
      x.onclick = () => b.remove();
      b.append(title, body, x);
      document.body.append(b);
    } catch (_) { /* never let the banner break a run */ }
  }

  async function run(settings) {
    busy = true; stopRequested = false;
    settings = await resolveSettings(settings);
    state = Object.assign(idleState(), { status: 'running', mode: settings.mode, startedAt: Date.now(), page: 1, message: 'Loading results…' });
    await push();

    const hasNote = !!((settings.note || '').trim() || (settings.shortNote || '').trim());
    const isFree = settings.mode === 'free';
    let capMessage = '';
    const MODES = globalThis.CONNECTO_MODES;
    const SAFE = MODES.SAFE;
    const safe = MODES.runMode(settings) === 'safe';
    state.runMode = safe ? 'safe' : 'crazy';
    const acct = isFree ? 'Free' : 'Premium';
    const dayCap = SAFE.daily[settings.mode] || SAFE.daily.free;
    const weekCap = SAFE.weekly[settings.mode] || SAFE.weekly.free;
    let sentToday = 0, sentWeek = 0;

    try {
      if (!isSearchPage()) throw new StopRun('Open a LinkedIn People search results page first.');

      // No caps of our own: notes are only treated as used up once LinkedIn
      // itself says so this month.
      let notesExhausted = false;
      if (isFree && hasNote) {
        const q = await getNoteQuota();
        if (q.exhausted || q.reportedLeft === 0) notesExhausted = true;
        if (notesExhausted && settings.freeFallback === 'stop') {
          throw new StopRun('No personalized notes left this month. Clear the note, or choose "Send without a note" when notes run out.');
        }
      }

      if (safe) {
        const { history = [] } = await getStore('history');
        const now = Date.now(), today = new Date().toDateString();
        const sent = history.filter(h => h.result === 'sent');
        sentToday = sent.filter(h => new Date(h.t).toDateString() === today).length;
        sentWeek = sent.filter(h => h.t >= now - 7 * 864e5).length;
        if (sentWeek >= weekCap) throw new StopRun(`Safe mode: you've sent ${sentWeek} invites in the last 7 days, the safe weekly limit for ${acct} (${weekCap}). Try again in a few days, or switch to Crazy mode at your own risk.`);
        if (sentToday >= dayCap) throw new StopRun(`Safe mode: you've sent ${sentToday} invites today, the safe daily limit for ${acct} (${dayCap}). Come back tomorrow.`);
      }
      const safeCapMessage = () =>
        sentWeek >= weekCap ? `Safe mode: reached the safe weekly limit for ${acct} (${weekCap} in 7 days). Try again in a few days.`
        : sentToday >= dayCap ? `Safe mode: reached today's safe limit for ${acct} (${dayCap}). Come back tomorrow.` : '';

      let attempts = 0;
      let sentThisRun = 0;
      let lastWasSent = false;
      let refusedInARow = 0;   // invites LinkedIn bounced back ("Connect again")
      // If the weekly limit was hit in the last 7 days, stop at the first bounce.
      const { weeklyLimitHitAt } = await getStore('weeklyLimitHitAt');
      const refusedStop = weeklyLimitHitAt && Date.now() - weeklyLimitHitAt < 7 * 864e5 ? 1 : REFUSED_STOP;
      let page = 0;
      pages: while (true) {
        page++;
        state.page = page;
        state.message = page === 1 ? 'Loading results…' : `Page ${page}: loading results…`;
        await push();

        await loadAllResults();
        const queue = snapshot();
        if (!queue.length) {
          if (page === 1) throw new StopRun('No profiles found on this page. Scroll the results into view and try again.');
          capMessage = 'No more results.';
          break;
        }
        state.total += queue.length;
        await push();

        for (const item of queue) {
          if (stopRequested) break pages;
          if (!isSearchPage()) throw new StopRun('You left the search results page, so the run stopped.');

          // LinkedIn re-renders result cards (e.g. after each invite), so look
          // the card up again by profile URL instead of trusting the old node.
          const card = refreshCard(item.card, item.url);
          if (!card) {
            state.failed++; state.processed++;
            addLog({ name: item.name, url: item.url }, 'failed', 'Result disappeared from the page');
            await push();
            continue;
          }
          const info = cardInfo(card);
          if (info.kind !== 'connect') {
            state.skipped++; state.processed++;
            addLog(info, 'skipped', info.reason);
            await addHistory({ t: Date.now(), name: info.name, url: info.url, result: 'skipped', detail: info.reason, withNote: false });
            await push();
            continue;
          }
          if (isFree && hasNote && notesExhausted && settings.freeFallback === 'stop') {
            throw new StopRun('Out of personalized notes for this month. Stopped, as set in your options.');
          }

          if (safe) {
            const cap = safeCapMessage();
            if (cap) { capMessage = cap; break pages; }
          }
          if (attempts > 0) {
            if (!safe) await sleep(rand(600, 1200)); // let LinkedIn finish re-rendering
            else if (sentThisRun > 0 && sentThisRun % SAFE.breakEvery === 0 && lastWasSent) {
              if (!(await pause(secs(SAFE.breakDelay), `Safe mode: short break after ${sentThisRun} invites. Next invite in`))) break pages;
            } else if (!(await pause(secs(SAFE.inviteDelay), 'Safe mode: next invite in'))) break pages;
          }
          attempts++;

          const picked = NOTE.pick(settings, info.name);
          const useNote = !!picked.text && !notesExhausted;
          state.message = `Inviting ${info.name}…`;
          await push();

          let res;
          try {
            res = await sendInvite(card, info, Object.assign({}, settings, { useNote, noteText: picked.text }));
          } catch (err) {
            res = fail('Unexpected error: ' + (err && err.message || err));
          }
          const which = res.noteWhich || picked.which;
          if (res.result === 'sent' && res.withNote && which === 'short') res.detail = res.detail.replace('with note', 'with short note');
          if (res.result === 'sent' && !res.withNote && which === 'tooLong') res.detail += ' (note too long)';
          if (res.noteWhich) settings = await resolveSettings(settings); // limit was just re-read

          if (res.noteLimitHit) { notesExhausted = true; await setNoteQuota({ exhausted: true, reportedLeft: 0 }); await markFreeIfUnknown(); }
          lastWasSent = res.result === 'sent';
          if (res.result === 'sent') {
            state.sent++; sentThisRun++; sentToday++; sentWeek++;
          } else if (res.result === 'skipped') state.skipped++;
          else state.failed++;
          state.processed++;

          addLog(info, res.result, res.detail);
          await addHistory({ t: Date.now(), name: info.name, url: info.url, result: res.result, detail: res.detail, withNote: !!res.withNote });
          await push();

          refusedInARow = res.refused ? refusedInARow + 1 : (res.result === 'sent' ? 0 : refusedInARow);
          if (res.weekly || refusedInARow >= refusedStop) {
            throw new StopRun(await weeklyLimitReached(settings.mode, res.weekly ? 'warning' : 'refused'));
          }
          if (res.stop) throw new StopRun(res.stop);
        }

        if (stopRequested) break;
        if (safe) {
          const cap = safeCapMessage();
          if (cap) { capMessage = cap; break; }
          if (!(await pause(secs(SAFE.pageDelay), 'Safe mode: next page in'))) break;
        }
        state.message = 'Opening the next page…';
        await push();
        if (!(await goNextPage())) { capMessage = 'No more result pages.'; break; }
      }

      const summary = `${state.sent} sent, ${state.skipped} skipped, ${state.failed} failed${page > 1 ? ` across ${page} pages` : ''}.`;
      if (stopRequested) { state.status = 'stopped'; state.message = `Stopped by you. ${summary}`; }
      else { state.status = 'done'; state.message = `Done${safe ? ' (Safe mode)' : ' (Crazy mode)'}. ${summary}${capMessage ? ' ' + capMessage : ''}`; }
    } catch (e) {
      state.status = e instanceof StopRun ? 'stopped' : 'error';
      state.message = e.message || String(e);
    } finally {
      busy = false;
      await push();
    }
  }

  /* ---------------- messages from the popup ---------------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'PING') { sendResponse({ ok: true, busy, onSearch: isSearchPage(), build: BUILD }); return; }
    if (msg.type === 'DETECT') {
      detectAccount(!!msg.force).then(d => sendResponse({ ok: true, detected: d }));
      return true; // async response
    }
    if (msg.type === 'STOP') {
      if (busy) {
        stopRequested = true;
        state.status = 'stopping';
        state.message = 'Stopping after the current step…';
        push();
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'START' || msg.type === 'SCAN') {
      if (busy) { sendResponse({ ok: false, error: 'Already running in this tab.' }); return; }
      sendResponse({ ok: true });
      (msg.type === 'START' ? run : scan)(msg.settings);
    }
  });

  // Exposed for automated tests only.
  globalThis.__connectoTest = { findCards, cardInfo, allDialogs, dialogKind };
})();
