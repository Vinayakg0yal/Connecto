/*
 * Everything that depends on LinkedIn's page structure lives in this file.
 * When LinkedIn changes its layout and the extension stops finding buttons,
 * this is the only file that should need editing.
 *
 * Matching is done mostly on accessible labels (aria-label) and visible
 * button text, which change far less often than CSS class names.
 */
globalThis.CONNECTO_SEL = {
  // Known containers for a single search result. Tried in order; if none
  // match, content.js falls back to a structural heuristic.
  resultCards: [
    'li.reusable-search__result-container',
    'div[data-chameleon-result-urn]',
    '[data-view-name="search-entity-result-universal-template"]',
    '[data-view-name="people-search-result"]'
  ],

  // Buttons on a result card (tested against aria-label AND visible text).
  label: {
    pending: [/^pending\b/i, /withdraw invitation/i, /invitation sent to/i],
    connect: [/^invite .+ to connect$/i, /^connect$/i],
    message: [/^message\b/i],
    follow: [/^follow\b/i]
  },

  // Dialogs (invite modal, limit warnings, upsells).
  dialog: '[role="dialog"], [role="alertdialog"], .artdeco-modal, [data-test-modal]',
  // Things that look like dialogs but aren't (chat bubbles etc.).
  dialogIgnore: '[class*="msg-overlay"], [class*="msg-convo"], aside',
  // LinkedIn sometimes renders modals inside a shadow root.
  shadowHosts: ['#interop-outlet', '[data-testid="interop-shadowdom"]'],

  // Buttons inside dialogs.
  modalButtons: {
    addNote: [/^add a note$/i, /^add note$/i, /^personali[sz]e invite$/i],
    sendWithoutNote: [/^send without a note$/i, /^send without note$/i],
    send: [/^send$/i, /^send now$/i, /^send invitation$/i, /^send invite$/i],
    dismiss: [/^dismiss$/i, /^close$/i, /^cancel$/i, /^got it$/i, /^not now$/i, /^ok$/i],
    discard: [/^discard$/i]
  },

  // Detecting the signed-in member's account type.
  account: {
    // LinkedIn's own "who am I" endpoint, used by the page itself.
    apiUrl: '/voyager/api/me',
    apiPremiumKey: 'premiumSubscriber',
    // Fallback: links in the top navigation bar.
    navArea: '#global-nav, header.global-nav, header[role="banner"], nav[aria-label="Primary Navigation"], header',
    premiumHref: [/\/premium\/my-premium/i, /\/premium\/manage/i],
    premiumText: [/^my premium$/i],
    freeText: [/try premium/i, /reactivate premium/i, /upgrade to premium/i, /premium for \S*0\b/i]
  },

  // Results pagination ("Next" button under the results).
  pagination: {
    next: [/^next$/i, /^next page$/i]
  },

  // The note box inside the invite dialog.
  noteField: 'textarea[name="message"], textarea#custom-message, textarea',

  // Text found in special dialogs.
  text: {
    weeklyLimit: [
      /weekly invitation limit/i,
      /reached the weekly limit/i,
      /out of invitations/i,
      /too many (pending )?invitations/i
    ],
    emailRequired: [
      /enter (their|his|her) email/i,
      /email address to connect/i,
      /to verify this member knows you/i
    ],
    noteLimit: [
      /personali[sz]ed (invitation|invite|note)s?/i,
      /custom (note|invitation)s?/i
    ],
    noteLimitHint: [/premium/i, /used all/i, /no (more )?free/i, /limit/i, /out of/i, /0 left/i],
    // "0/300" style character counter under the note box.
    charCounter: /\b\d{1,4}\s*\/\s*(\d{2,4})\b/,
    notesLeft: /(\d+)\s+(?:free\s+)?personali[sz]ed\s+(?:invitations?|invites?|notes?)\s+(?:left|remaining)/i
  }
};
