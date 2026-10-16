# Troubleshooting

## The popup says to open a People search page

The URL must start with `https://www.linkedin.com/search/results/people`. Run a search, then click the **People** filter. Searching from the top bar often lands on "All" results first.

## Preview finds no profiles

- Scroll down the results once so LinkedIn renders them, then try again.
- Reload the LinkedIn tab (needed if it was open before you installed or reloaded the extension).
- If it still finds none, LinkedIn may have changed its layout. See "Updating selectors" below.

## Invites fail with "Invite dialog did not open" or "Could not find the Send button"

LinkedIn has probably renamed a button or changed its dialog. See "Updating selectors" below.

## Everyone is marked "Follow only"

Some profiles hide **Connect** behind **More**, or only allow following. Connecto skips these by design.

## Notes aren't being added

- **Free account:** you may have used this month's personalized notes. The popup shows how many are left.
- **Note too long:** add a **Short version**, or shorten your note. Run **Preview** to see which note each person gets.

## The run stopped on its own

Check the message in the popup. Common reasons:

- Max per run reached
- Weekly cap reached (counts the last 7 days)
- LinkedIn showed its weekly invitation limit warning
- Notes ran out and "When notes run out" is set to **Stop the run**
- The LinkedIn tab was closed or navigated away

## The popup shows a stalled run

If the LinkedIn tab hasn't reported progress for 45 seconds, the popup treats the run as stalled. Reload the LinkedIn tab and start again. Already-invited people will be skipped as **Pending**.

## I edited the code and nothing changed

Go to `chrome://extensions`, click the reload icon (↻) on the Connecto card, then reload your LinkedIn tab.

## Updating selectors

All LinkedIn-specific matching lives in **`selectors.js`**:

| Key | What it matches |
|---|---|
| `resultCards` | CSS selectors for one search result, tried in order |
| `label.connect` / `pending` / `message` / `follow` | Button labels on a result card |
| `dialog`, `dialogIgnore`, `shadowHosts` | Where to find LinkedIn's modals |
| `modalButtons.addNote` / `send` / `sendWithoutNote` / `dismiss` / `discard` | Buttons inside the invite dialog |
| `pagination.next` | The **Next** results button |

To find the new label:

1. On the LinkedIn results page, right-click a **Connect** button and choose **Inspect**.
2. Look at its `aria-label` (for example `Invite Jane Doe to connect`) or its visible text.
3. Add a matching regular expression to the right list in `selectors.js`, for example:

   ```js
   connect: [/^invite .+ to connect$/i, /^connect$/i, /^your new label$/i],
   ```

4. Reload the extension (↻) and the LinkedIn tab, then run **Preview**.

Patterns are tested against both `aria-label` and visible text, so prefer those over CSS class names, which LinkedIn changes often.
