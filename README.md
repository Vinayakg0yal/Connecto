<p align="center">
  <img src="icons/connecto-logo-512.png" alt="Connecto logo" width="128" height="128">
</p>

<h1 align="center">Connecto</h1>

<p align="center">
  A Chrome extension that sends LinkedIn connection invitations, with an optional personalized note,<br>
  to the people on your current <b>People</b> search results page.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-1fb6a6">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-f59e0b">
  <img alt="No dependencies" src="https://img.shields.io/badge/dependencies-none-0b1f2c">
</p>

---

## What it is

Connecto is a small, dependency-free Chrome extension (plain HTML, CSS and JavaScript, Manifest V3). You run a People search on LinkedIn, open Connecto from the toolbar, write a note like `Hi {firstName}, …`, and it works through the results one card at a time: clicking **Connect**, adding your personalized note, and sending the invite. Anyone you're already connected to, have already invited, or can't invite is skipped.

It only runs when you press a button, only on the LinkedIn tab you're looking at, and everything it stores stays in your browser.

## Features

- **Personalized notes** with `{firstName}` and `{name}` placeholders (names are cleaned of emoji, pronouns, "(Hiring)", ", MBA" and so on).
- **Preview mode** shows who would be invited and who would be skipped, without clicking anything.
- **Free vs Premium auto-detection**, with a manual override.
- **Live note-limit detection**: reads the real character limit from LinkedIn's note box instead of hard-coding 200/300.
- **Short-note fallback**: if your note is too long, it uses your short version, or sends without a note. It never cuts a note off mid-sentence.
- **Smart skipping**: pending invites, existing connections, follow-only profiles, and "email required" profiles.
- **Fast runs**: no artificial delays or caps. It waits only as long as LinkedIn's pop-ups take to appear.
- **Usage & limits panel**: invites sent today, this week (against LinkedIn's typical ~100/week) and this month, notes left, note length limit and account type. For information only.
- **Weekly-limit handling**: if LinkedIn shows its weekly invitation limit warning, the run stops and the popup shows roughly when the limit should lift.
- **Multi-page runs**: optionally clicks **Next** and keeps going until there are no more results.
- **Live stats and activity log** (Sent / Skipped / Failed), plus **CSV export** of your history.

## Quick start

1. Download or clone this repo.
2. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `Connecto` folder.
3. On LinkedIn, search for people (for example "technical recruiter" in Greater Toronto Area).
4. Click the Connecto icon → write your note → **Preview** → **Send invites**.

Full step-by-step instructions are in **[INSTALL.md](INSTALL.md)**.

## Documentation

| Doc | What's in it |
|---|---|
| [INSTALL.md](INSTALL.md) | Installing, updating, pinning and uninstalling the extension |
| [USAGE.md](USAGE.md) | Using the popup: notes, account type, the Usage & limits panel, exporting history |
| [HOW_IT_WORKS.md](HOW_IT_WORKS.md) | Architecture, the invite flow, account and limit detection, storage |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Fixing common problems, and updating `selectors.js` when LinkedIn changes its layout |

## Project structure

```
Connecto/
├── manifest.json        Extension config (Manifest V3)
├── popup.html           Popup UI markup
├── popup.css            Popup styles
├── popup.js             Popup logic: settings, controls, live progress, CSV export
├── content.js           Runs on linkedin.com: finds result cards and sends invites
├── note.js              Note templating, name cleaning and length limits (shared)
├── selectors.js         Every LinkedIn-specific pattern, in one place
└── icons/
    ├── icon16.png, icon32.png, icon48.png, icon128.png
    ├── connecto-logo.svg
    └── connecto-logo-512.png
```

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saves your settings, run progress and invite history locally |
| `scripting` | Injects the content script into an already-open LinkedIn tab if needed |
| `activeTab` | Talks to the LinkedIn tab you're on when you open the popup |
| `https://www.linkedin.com/*` | The only site the extension runs on |

No data is sent anywhere. There's no server, analytics or tracking.

## ⚠️ Important

LinkedIn's User Agreement prohibits automated tools that send connection requests, and accounts that use them can be warned or restricted. Connecto only runs when you click it, but it **does not pace itself or cap volume**. Rapid, back-to-back invites are the pattern LinkedIn's automation detection looks for most, so heavy use raises the chance of a warning or restriction. Keep an eye on the Usage & limits panel, and use it at your own risk.

This project is not affiliated with, endorsed by, or sponsored by LinkedIn.
