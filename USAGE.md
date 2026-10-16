# Using Connecto

## 1. Run a People search

On LinkedIn, search for anything and choose the **People** filter, then add any filters you like (for example *Locations: Greater Toronto Area*, *Connections: 2nd*). Connecto works on whatever results page you're looking at.

## 2. Open the popup

Click the Connecto icon in the toolbar. If you're not on a People search page, a banner tells you so.

## 3. Account type

Leave it on **Auto**. Connecto detects whether your account is Free or Premium and shows what it found under the switch. Choose **Free** or **Premium** only if the detection is wrong.

## 4. Write your note (optional)

Type or paste a note. Use the chips to insert placeholders:

| Placeholder | Becomes |
|---|---|
| `{firstName}` | The person's first name, cleaned up (e.g. "Dr. JANE DOE (She/Her)" → "Jane") |
| `{name}` | Their full name, cleaned up |

Example:

```
Hi {firstName}, I'm a software developer in Toronto exploring new roles and would love to connect.
```

The counter shows your note's length against the limit for your account (usually 200 for Free, 300 for Premium).

**If your note is too long**, a **Short version** box appears. For each person Connecto uses the full note if it fits, otherwise the short version, otherwise no note. Notes are never cut off mid-sentence.

**Free accounts only:** LinkedIn allows a few personalized notes per month. The popup shows how many are left, and you choose what happens when they run out: **Send without a note** or **Stop the run**.

Leave the note empty to send invites without notes.

## 5. Preview

Click **Preview**. Connecto lists everyone on the page as either:

- **Ready**, with the exact note each person would get, or
- **Skipped**, with the reason (Pending, Already connected, Follow only, Email required).

Nothing is clicked or sent. The first Preview may briefly open one invite box to read LinkedIn's note limit, then close it.

## 6. Send invites

Click **Send invites**. You'll see **Sent / Skipped / Failed** update live, a progress bar, and a countdown to the next invite. Press **Stop** at any time; the run finishes its current step and stops.

You can close the popup during a run. Keep the LinkedIn tab open; reopening the popup shows the current progress.

## Pacing & limits

Open **Pacing & limits** to adjust:

| Setting | Default | Meaning |
|---|---|---|
| Min / Max delay (s) | 8 / 20 | Random wait between invites |
| Max per run | 20 | Stop after this many sent in one run |
| Weekly cap | 100 | Stop when this many have been sent in the last 7 days |
| Free notes / month | 5 | Your Free account's note allowance |
| Max pages | 5 | How many results pages to go through |
| Continue to the next results pages automatically | off | Clicks **Next** and keeps going |

If LinkedIn shows its weekly invitation limit warning, the run stops immediately regardless of these settings.

**Reset counters & history** clears your local history and weekly count.

## Activity log and export

The **Activity** list shows each person with their result and details. **Export CSV** downloads your full history (time, name, profile URL, result, details) for use in a spreadsheet.

## Tips

- Keep numbers modest. Smaller daily volumes and longer delays look more natural.
- Narrow your search with filters so the people you invite are relevant.
- Always run **Preview** after changing your note to check how names come out.
