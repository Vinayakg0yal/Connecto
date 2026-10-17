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
| `content.js` | Finds result cards, classifies each person, opens invite dialogs, types notes, confirms sends, pages through results |
| `popup.js` | Loads/saves settings, sends commands to the tab, renders progress and the Usage & limits panel from storage, exports CSV |

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
   - **Weekly limit warning** (dialog or toast) → close it, save the time as `weeklyLimitHitAt`, and stop the whole run.
   - **Email required** → close it and skip this person.
   - **Out of personalized notes** (Free) → send without a note or stop, depending on your setting.
4. Without a note: click **Send without a note** (or **Send**).
5. With a note:
   - Click **Add a note** and wait for the text box.
   - Read LinkedIn's real limit from the box's `maxlength` and its "0/300" counter, and save it.
   - Choose the note: the full note if it fits, otherwise the short version, otherwise none.
   - Type the note the way a person would (firing the input events LinkedIn listens for), check it landed, then click **Send**.
6. **Confirm.** Watch the card for up to 6 seconds:
   - it shows **Pending** → sent;
   - a weekly-limit dialog or toast appears → stop the run;
   - the button comes back as **Connect again** (or still **Connect**) → **not sent**. LinkedIn silently refused it, which almost always means the weekly limit. Logged as failed; two in a row stops the run with a "done for this week" message and a banner on the page;
   - anything else (for example the card re-rendered without a button) → logged as sent, marked "(unverified)".
7. Record the result in `history` and the live `run` log, wait about a second for LinkedIn to finish re-rendering, and move to the next person. There are no other delays.

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

**Monthly notes (Free).** Connecto only treats notes as used up once LinkedIn itself says so (its "out of personalized invitations" prompt, or "0 remaining"). The popup shows an estimate based on a typical 5 notes a month until LinkedIn reports the real number.

## Limits

Connecto has **no pacing or caps of its own**. It doesn't add random delays, per-run limits or weekly caps; it waits only for LinkedIn's dialogs and re-renders.

A run ends when:

- there's no **Next** page left (every page of results has been processed);
- you press **Stop**;
- LinkedIn's weekly invitation limit is reached: either it shows a warning, or invites bounce back to **Connect again** (two in a row, or one if the limit was already hit in the last 7 days);
- a Free account is out of notes and "When notes run out" is set to **Stop the run**.

The popup's **Usage & limits** panel is computed from `history` and is for information only: sent in the last 7 days (against a typical weekly limit of ~100 for Free or ~200 for Premium, based on the account type in effect), today and this month, notes sent and left, the note length limit, the account type, and, if the weekly warning appeared in the last 7 days, when it should lift.

## Multi-page runs

Every run is multi-page. After finishing a page Connecto scrolls down, clicks LinkedIn's **Next** button, waits until the page number changes and the first result is different, lets the new results render, and continues until there are no more pages.

## Version check

The page script reports its version (from `manifest.json`) when the popup pings it. If an open LinkedIn tab is still running an older copy, which happens when Connecto is updated while the tab is open, the popup doesn't inject a second copy next to it, because both could respond to **Send invites**. It shows an **Update now** banner instead, which refreshes the tab and reloads the extension.

## Storage

Everything lives in `chrome.storage.local` in your browser:

| Key | Contents |
|---|---|
| `settings` | Your popup settings (note, short note, account type choice, what to do when notes run out, multi-page) |
| `run` | Live state of the current or last run (status, counters, last 300 log lines) |
| `history` | Every invite result with timestamp, name, profile URL, and whether a note was used (last 5,000) |
| `noteQuota` | This month's Free note usage and whether LinkedIn said you're out |
| `weeklyLimitHitAt`, `weeklyLimitHow` | When the weekly limit was last hit, and whether LinkedIn showed a warning or silently bounced invites |
| `detected` | Detected account type and the note limits read from LinkedIn |

**Export CSV** downloads `history`. **Reset counters & history** clears it.

## When LinkedIn changes its layout

All page-specific matching is in `selectors.js`. If Connecto stops finding buttons or dialogs, that's the only file that should need editing. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
