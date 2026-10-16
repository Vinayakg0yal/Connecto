/* Note templating, shared by the popup and the content script. */
globalThis.CONNECTO_NOTE = (() => {
  // LinkedIn's usual note limits. These are only fallbacks: the real limit is
  // read from LinkedIn's note box and stored as "detected.limits".
  const LIMITS = { free: 200, premium: 300 };
  const HONORIFICS = /^(dr|mr|mrs|ms|miss|prof|sir)\.?$/i;

  function cleanName(name) {
    return (name || '')
      .replace(/\(.*?\)|\[.*?\]/g, ' ')        // "(She/Her)", "[Hiring]"
      .replace(/,.*$/, '')                     // ", CPA", ", MBA"
      .replace(/[^\p{L}\p{M}\s'.-]/gu, ' ')    // emoji, symbols
      .replace(/\s+/g, ' ')
      .trim();
  }

  function firstNameOf(name) {
    const tokens = cleanName(name).split(' ').filter(t => t && !HONORIFICS.test(t));
    let first = tokens[0] || '';
    if (first.length < 2 || /^linkedin$/i.test(first)) return 'there';
    if (first === first.toUpperCase()) first = first[0] + first.slice(1).toLowerCase();
    return first;
  }

  function render(template, name) {
    return (template || '')
      .replace(/\{\s*first\s*name\s*\}/gi, firstNameOf(name))
      .replace(/\{\s*name\s*\}/gi, cleanName(name) || 'there')
      .trim();
  }

  // Mode actually in effect: the user's choice, or what was detected in Auto.
  function effectiveMode(settings, detected) {
    if (settings.modeChoice === 'free' || settings.modeChoice === 'premium') return settings.modeChoice;
    return detected && detected.premium === true ? 'premium' : 'free';
  }

  // Note limit for a mode: the value last read from LinkedIn, else the default.
  function limitFor(mode, detected) {
    const l = detected && detected.limits && detected.limits[mode];
    return l && l.value ? l.value : (LIMITS[mode] || LIMITS.free);
  }

  // Chooses the note for one person: the full note if it fits LinkedIn's
  // limit, otherwise the short version, otherwise no note. Never cuts a
  // note off mid-sentence.
  function pick(settings, name) {
    const limit = settings.limit || LIMITS[settings.mode] || LIMITS.free;
    const full = render(settings.note, name);
    if (full && full.length <= limit) return { text: full, which: 'full' };
    const short = render(settings.shortNote, name);
    if (short && short.length <= limit) return { text: short, which: 'short' };
    return { text: '', which: full || short ? 'tooLong' : 'none' };
  }

  // Worst-case length used for validation in the popup (assumes a long-ish name).
  function previewLength(template) {
    return (template || '')
      .replace(/\{\s*first\s*name\s*\}/gi, 'Alexandria')
      .replace(/\{\s*name\s*\}/gi, 'Alexandria Montgomery')
      .trim().length;
  }

  return { LIMITS, cleanName, firstNameOf, render, pick, previewLength, effectiveMode, limitFor };
})();
