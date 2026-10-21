# Installation guide

Connecto isn't on the Chrome Web Store, so you load it as an "unpacked" extension. It takes about a minute and works in Google Chrome and other Chromium browsers (Edge, Brave, Arc, Opera).

## Requirements

- Google Chrome 88 or newer (or another Chromium-based browser)
- A LinkedIn account, signed in on `www.linkedin.com`

## 1. Get the code

**Option A: download the latest release (recommended)**

1. Go to the [latest release](https://github.com/Vinayakg0yal/Connecto/releases/latest).
2. Under **Assets**, download **Source code (zip)**.
3. Unzip it. You'll get a folder such as `Connecto-1.3.0` containing `manifest.json`. Load that folder.

**Option B: clone with git**

```bash
git clone https://github.com/Vinayakg0yal/Connecto.git
```

Keep the folder somewhere permanent (for example `~/Extensions/Connecto`). Chrome loads the extension from that folder, so deleting or moving it removes the extension.

## 2. Load it into Chrome

1. Open a new tab and go to `chrome://extensions`.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the folder that contains `manifest.json` (the `Connecto` folder itself, not its parent).
5. Connecto now appears in your list of extensions with its icon.

> **Edge:** go to `edge://extensions`, turn on **Developer mode** (left sidebar), then **Load unpacked**.
> **Brave:** go to `brave://extensions`, same steps as Chrome.

## 3. Pin it to the toolbar

1. Click the puzzle-piece (Extensions) icon in Chrome's toolbar.
2. Click the pin next to **Connecto**.

The Connecto icon is now one click away.

## 4. Check that it works

1. Click the Connecto icon. Unless you're already on a LinkedIn People search, you'll see a **Go to LinkedIn search** button. Click it.
2. LinkedIn's People search opens. Search for anyone (for example "recruiter"), and add filters if you like.
3. Click the Connecto icon again, then **Preview**. You should see a list of people marked "Ready" or "Skipped". Preview never clicks anything.

If you had LinkedIn open before installing, reload that tab once.

Next: read [USAGE.md](USAGE.md) to set up your note and limits.

## Updating

Connecto doesn't update itself (Chrome only auto-updates extensions from the Chrome Web Store). When a new version is out, the popup shows an amber **Update to vX.Y.Z** pill. Click it to open the release, then:

**If you downloaded a ZIP:** download the new **Source code (zip)**, replace the files in your Connecto folder, then go to `chrome://extensions` and click the reload icon (↻) on the Connecto card.

**If you cloned with git:**

```bash
cd Connecto
git pull
```

Then click the reload icon (↻) on the Connecto card, and reload any open LinkedIn tabs.

Your settings and history are kept across updates because they're stored in Chrome, not in the folder.

## Uninstalling

1. Go to `chrome://extensions`.
2. Click **Remove** on the Connecto card.

This also deletes its locally stored settings and history. Use **Export CSV** in the popup first if you want to keep your history.
