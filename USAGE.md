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

Click **Send invites**. You'll see **Sent / Skipped / Failed** update live, with a progress bar. Press **Stop** at any time; the run finishes its current step and stops.

Connecto has no delays or caps of its own: it sends invites back to back, waiting only as long as LinkedIn's pop-ups take to appear.

You can close the popup during a run. Keep the LinkedIn tab open; reopening the popup shows the current progress.

## Continue through all results pages

Tick **Continue through all results pages automatically** to have Connecto click **Next** after each page and keep going until there are no more results. Leave it off to process only the page you're on.

## Usage & limits

The **Usage & limits** panel is for information only. Connecto never slows down or stops because of these numbers.

| Item | Meaning |
|---|---|
| Sent in the last 7 days | With a bar against LinkedIn's typical ~100/week (it turns amber near the limit and red past it). LinkedIn doesn't publish the exact number. |
| Sent today / this month | Invites sent, from your local history |
| Notes sent this month | Invites that included a personalized note |
| Personalized notes left | Free accounts: exact once LinkedIn shows its "X remaining" text, otherwise an estimate. Premium: unlimited |
| Note length limit | Read from LinkedIn's note box, or the default until it's been read |
| Account | Free or Premium, and whether it was detected, assumed, or set manually |

If LinkedIn shows its **weekly invitation limit** warning, the run stops (LinkedIn refuses every further invite at that point), and the panel shows when it happened and roughly when it should lift, usually about a week later.

**Reset counters & history** clears your local history and counters.

## Activity log and export

The **Activity** list shows each person with their result and details. **Export CSV** downloads your full history (time, name, profile URL, result, details) for use in a spreadsheet.

## Tips

- Keep numbers modest. Connecto doesn't pace itself, so watch the weekly count in Usage & limits and stop well before ~100.
- Narrow your search with filters so the people you invite are relevant.
- Always run **Preview** after changing your note to check how names come out.
