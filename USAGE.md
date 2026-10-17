# Using Connecto

## 1. Run a People search

On LinkedIn, search for anything and choose the **People** filter, then add any filters you like (for example *Locations: Greater Toronto Area*, *Connections: 2nd*). Connecto works on whatever results page you're looking at.

## 2. Open the popup

Click the Connecto icon in the toolbar. If you're not on a People search page, a banner tells you so.

## 3. Run mode: Safe or Crazy

Pick a mode at the top of the popup. Both modes move to the next results page on their own; you never have to change pages yourself.

| | **Safe** (default) | **Crazy** |
|---|---|---|
| Gap between invites | Random 25–60 s | None (about a second for LinkedIn to re-render) |
| Breaks | 2–5 min after every 10 invites | None |
| Pause before the next page | 15–35 s | None |
| Daily limit | 15 (Free) · 30 (Premium) | None |
| Weekly limit (last 7 days) | 80 (Free) · 150 (Premium) | None; runs until LinkedIn's own weekly limit stops it |
| Risk | Lower, but not zero | High |

**Safe mode** follows LinkedIn's pace: it waits between invites like a person would, takes breaks, and stops on its own when it reaches its daily or weekly limit ("come back tomorrow" / "try again in a few days"). The limits sit well under LinkedIn's typical weekly limits (~100 Free, ~200 Premium). The popup shows a countdown to the next invite.

**Crazy mode** has no delays and no limits. It sends invites back to back and keeps going until LinkedIn itself refuses them. Switching to it asks you to confirm, and the popup shows a red warning while it's on:

> ⚠️ LinkedIn's User Agreement does not allow bots or automated tools that send connection requests, and rapid bulk invites are exactly what its detection looks for. Abusing Crazy mode can get your account **restricted or permanently banned**. Use it at your own risk.

## 4. Account type

Leave it on **Auto**. Connecto detects whether your account is Free or Premium and shows what it found under the switch. Choose **Free** or **Premium** only if the detection is wrong.

## 5. Write your note (optional)

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

## 6. Preview

Click **Preview**. Connecto lists everyone on the page as either:

- **Ready**, with the exact note each person would get, or
- **Skipped**, with the reason (Pending, Already connected, Follow only, Email required).

Nothing is clicked or sent. The first Preview may briefly open one invite box to read LinkedIn's note limit, then close it.

## 7. Send invites

Click **Send invites**. You'll see **Sent / Skipped / Failed** update live, with a progress bar. Press **Stop** at any time; the run finishes its current step and stops.

In **Safe** mode you'll see a countdown to the next invite (and to the next page). In **Crazy** mode invites go out back to back.

You can close the popup during a run. Keep the LinkedIn tab open; reopening the popup shows the current progress.

## Multiple pages

**Send invites** works through every page of results on its own: when a page is done, Connecto clicks **Next** and carries on. It keeps going until you press **Stop**, the results run out, LinkedIn's weekly invitation limit is reached, or (in Safe mode) Safe mode's daily or weekly limit is reached.

## Usage & limits

The **Usage & limits** panel shows where you stand. In **Safe** mode it also shows how much of today's and this week's safe allowance is left (**Safe mode left**), and the run stops when either reaches zero. In **Crazy** mode the numbers are for information only.

| Item | Meaning |
|---|---|
| Sent in the last 7 days | With a bar against LinkedIn's typical weekly limit for your account type: ~100 on Free, ~200 on Premium. In **Auto** it follows the detected account type (it turns amber near the limit and red past it). LinkedIn doesn't publish the exact number. |
| Sent today / this month | Invites sent, from your local history |
| Notes sent this month | Invites that included a personalized note |
| Personalized notes left | Free accounts: exact once LinkedIn shows its "X remaining" text, otherwise an estimate. Premium: unlimited |
| Note length limit | Read from LinkedIn's note box, or the default until it's been read |
| Account | Free or Premium, and whether it was detected, assumed, or set manually |

### When you hit the weekly limit

LinkedIn enforces its weekly invitation limit in two ways, and Connecto catches both:

- **A warning** (pop-up or toast saying you've reached the weekly invitation limit).
- **Silently**: you click Send, but the invite isn't sent. The card's button comes back as **Connect again** (or plain **Connect**) instead of **Pending**.

When that happens the run stops and you get a message, in the popup and as a banner on the LinkedIn page, that you're **done for this week**, with how many invites you've sent in the last 7 days and roughly when LinkedIn should accept invites again (about a week later). The invite that bounced is logged as *Failed: Not sent*, not as sent.

A single bounce can occasionally be a glitch, so Connecto stops after **two bounces in a row**. If the limit was already hit in the last 7 days, it stops at the **first** bounce.

**Reset counters & history** clears your local history and counters.

## Activity log and export

The **Activity** list shows each person with their result and details. **Export CSV** downloads your full history (time, name, profile URL, result, details) for use in a spreadsheet.

## Tips

- Stay in **Safe** mode unless you understand the risk. If you use Crazy mode, watch the weekly count in Usage & limits and stop well before your typical weekly limit (~100 on Free, ~200 on Premium).
- Narrow your search with filters so the people you invite are relevant.
- Always run **Preview** after changing your note to check how names come out.
