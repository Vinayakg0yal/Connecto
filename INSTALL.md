# Installation guide

Connecto isn't on the Chrome Web Store, so you load it as an "unpacked" extension. It takes about a minute and works in Google Chrome and other Chromium browsers (Edge, Brave, Arc, Opera).

## Requirements

- Google Chrome 88 or newer (or another Chromium-based browser)
- A LinkedIn account, signed in on `www.linkedin.com`

## 1. Get the code

**Option A: download a ZIP**

1. On this repo's GitHub page, click **Code → Download ZIP**.
2. Unzip it. You'll get a folder such as `Connecto-main`.

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

1. Go to LinkedIn and search for something, then choose the **People** filter.
   The address should start with `https://www.linkedin.com/search/results/people`.
2. Click the Connecto icon.
3. Click **Preview**. You should see a list of people marked "Ready" or "Skipped". Preview never clicks anything.

If the popup says you need to be on a People search page, check the URL from step 1. If you had the LinkedIn tab open before installing, reload it once.

Next: read [USAGE.md](USAGE.md) to set up your note and limits.

## Updating

**If you downloaded a ZIP:** download the new ZIP, replace the files in your Connecto folder, then go to `chrome://extensions` and click the reload icon (↻) on the Connecto card.

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
