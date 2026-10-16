# How Connecto works

Connecto is a Manifest V3 Chrome extension with two halves that talk through Chrome messaging and `chrome.storage.local`:

- **The popup** (`popup.html`, `popup.css`, `popup.js`) holds your settings and buttons, and shows live progress.
- **The content script** (`selectors.js`, `note.js`, `content.js`) runs inside `linkedin.com` tabs and does the actual clicking.

There's no background service worker, no server and no network calls of its own.

```
┌──────────────────────┐   PING / DETECT / SCAN / START / STOP   ┌───────────────────────────┐
│        Popup         │ ──────────────────────────────────────▶ │  Content script (LinkedIn) │
│  settings, buttons,  │                                         │  selectors.js              │
│  stats, activity log │ ◀────────────────────────────────────── │  note.js                   │
└──────────────────────┘   chrome.storage.local  "run" state     │  content.js                │
           ▲                                                      └───────────────────────────┘
           │  chrome.storage.local: settings · run · history · noteQuota · detected
           └──────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|---|---|
| `manifest.json` | Declares the popup, icons, permissions, and injects the three content scripts on `https://www.linkedin.com/*` |
| `selectors.js` | Exposes `CONNECTO_SEL`: every LinkedIn-specific pattern (result-card containers, button labels, dialog text, pagination) |
| `note.js` | Exposes `CONNECTO_NOTE`: name cleaning, `{firstName}` / `{name}` templating, note-length limits, choosing full / short / no note. Shared by popup and content script |
| `content.js` | Finds result cards, classifies each person, opens invite dialogs, types notes, confirms sends, enforces caps, pages through results |
| `popup.js` | Loads/saves settings, sends commands to the tab, renders progress from storage, exports CSV |

## Message flow

When you open the popup:

1. `popup.js` reads `settings`, `run`, `history`, `noteQuota` and `detected` from storage.
2. It sends `PING` to the active tab. If the content script isn't there yet (for example the tab was open before the extension was installed), it injects it with `chrome.scripting.executeScript` and pings again.
3. It sends `DETECT` so the content script can check whether the account is Free or Premium.

When you press a button, the popup sends one of:

| Message | What the content script does |
|---|---|
| `SCAN` | **Preview.** Classifies every card on the page and logs what *would* happen. Nothing is sent. |
| `START` | **Send invites.** Runs the invite loop described below. |
| `STOP` | Sets a stop flag. The run finishes its current step and then stops. |

While working, the content script writes its state (status, counters, log, message, a heartbeat timestamp) to `chrome.storage.local` under `run`. The popup listens with `chrome.storage.onChanged` and redraws, so you can close and reopen the popup mid-run without losing anything. If the heartbeat goes quiet for 45 seconds, the popup treats the run as stalled.

## Reading the search page

1. **Check the page.** Runs only on `/search/results/people`.
2. **Load all results.** Scrolls the page so LinkedIn renders every card.
3. **Find the cards.** Tries the container selectors in `selectors.js` in order. If none match, it falls back to a heuristic: start from each `/in/<profile>` link and climb to the largest ancestor that still refers to only that one person.
4. **Classify each card** by its buttons (matched on `aria-label` and visible text, which change less often than CSS class names):
   - **Connect** button → can be invited
   - **Pending** → skipped (already invited)
   - **Message** only / 1st degree → skipped (already connected)
   - **Follow** only → skipped (LinkedIn hides Connect for this profile)

## Sending one invite

For each person who can be invited:

1. Scroll the card into view and click **Connect**.
2. Wait for LinkedIn's dialog (it also looks inside shadow roots, where LinkedIn sometimes renders modals).
3. Identify the dialog:
   - **Weekly limit warning** → close it and stop the whole run.
   - **Email required** → close it and skip this person.
   - **Out of personalized notes** (Free) → send without a note or stop, depending on your setting.
4. Without a note: click **Send without a note** (or **Send**).
5. With a note:
   - Click **Add a note** and wait for the text box.
   - Read LinkedIn's real limit from the box's `maxlength` and its "0/300" counter, and save it.
   - Choose the note: the full note if it fits, otherwise the short version, otherwise none.
   - Type the note the way a person would (firing the input events LinkedIn listens for), check it landed, then click **Send**.
6. **Confirm** the card now shows **Pending**. If it doesn't, the result is still logged as sent but marked "(unverified)".
7. Record the result in `history` and the live `run` log, then wait a random delay (default 8–20 s) before the next person.

## Choosing the note

`note.js` builds each note from your template:

- `{firstName}` → the first real name token. Honorifics (Dr, Mr, Ms…), emoji, "(She/Her)", "[Hiring]" and ", MBA"-style suffixes are removed; ALL-CAPS names are re-cased; anything unusable becomes "there".
- `{name}` → the cleaned full name.

Then it picks, per person:

1. the full note, if its length is within the limit;
2. otherwise the short note, if that fits;
3. otherwise no note.

A note is never cut off mid-sentence. In the popup, length is checked against a worst-case long name ("Alexandria Montgomery") so the warning appears before you start.

## Account type and limit detection

**Free or Premium.** In **Auto** mode the content script looks for LinkedIn's own `premiumSubscriber` flag in the account data the page loads. If that isn't available, it reads the top navigation ("Try Premium" = Free, "My Premium" = Premium). Hitting LinkedIn's "out of personalized invitations" prompt also marks the account as Free. You can override with **Free** or **Premium**.

**Note length.** Never hard-coded. 200 (Free) and 300 (Premium) are only fallbacks. The real value is read from LinkedIn's note box:

- on **Preview**, if it hasn't been read in the last 7 days (opens one invite box, reads the limit, closes it; nothing is sent);
- on **every invite**, just before typing. If LinkedIn lowered the limit, Connecto switches to the short note (or no note) for that person and everyone after.

**Monthly notes (Free).** Tracked from your history and from LinkedIn's "X remaining" text when it appears.

## Safety limits

| Limit | Default | Behaviour |
|---|---|---|
| Random delay | 8–20 s | Between invites, randomized |
| Max per run | 20 | Run stops when reached |
| Weekly cap | 100 | Counts invites sent in the last 7 days |
| Max pages | 5 | Only with "Continue to the next results pages" on |
| LinkedIn weekly-limit dialog | – | Run stops immediately |

## Multi-page runs

With **Continue to the next results pages automatically** on, after finishing a page Connecto scrolls down, clicks LinkedIn's **Next** button, waits until the page number changes and the first result is different, pauses a moment, and continues. It stops at Max pages, the per-run cap, or the weekly cap, whichever comes first.

## Storage

Everything lives in `chrome.storage.local` in your browser:

| Key | Contents |
|---|---|
| `settings` | Your popup settings (note, short note, account type choice, delays, caps) |
| `run` | Live state of the current or last run (status, counters, last 300 log lines) |
| `history` | Every invite result with timestamp, name, profile URL, and whether a note was used (last 5,000) |
| `noteQuota` | This month's Free note usage and whether LinkedIn said you're out |
| `detected` | Detected account type and the note limits read from LinkedIn |

**Export CSV** downloads `history`. **Reset counters & history** clears it.

## When LinkedIn changes its layout

All page-specific matching is in `selectors.js`. If Connecto stops finding buttons or dialogs, that's the only file that should need editing. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
