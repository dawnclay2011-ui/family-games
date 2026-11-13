# Daily checklists

Separate phone pages for Cam and Christian. Both pages read **one** lesson plan: `daily/plans.json`. The pages do not share a tab, a scoreboard, or each other's checks.

Checks and the optional note stay in the browser that marked them. The page does not upload them. **Send to Mom** opens the device share sheet when the browser has one, so the child can choose an app and a person. **Copy summary** is the fallback. This is a self-report, not a verified result and not credit.

## Routes

These paths are in the repo. They are **not live** until a reviewed change is published on the existing site.

| Page | Repo file | Path on the site, after a future publish |
| --- | --- | --- |
| Plan index | `daily/index.html` | `/family-games/daily/` |
| Cam | `daily/cam/index.html` | `/family-games/daily/cam/` |
| Christian | `daily/christian/index.html` | `/family-games/daily/christian/` |
| Preview for Cam | `daily/preview/cam/index.html` | `/family-games/daily/preview/cam/` |
| Preview for Christian | `daily/preview/christian/index.html` | `/family-games/daily/preview/christian/` |
| Sample reading card | `daily/sample-reading.html` | `/family-games/daily/sample-reading.html` |

The public site, when `main` is published, is `https://dawnclay2011-ui.github.io/family-games/`. Opening these paths before publish returns the host's missing-page response.

Cam's page does not link to Christian's page. Christian's page does not link to Cam's page.

## Preview and real days

`sample` in `plans.json` is example data for the preview routes only. It is not a calendar day and not an assignment. The preview banner says so, and the preview pages do not pre-check any task.

A real date with `"status": "preparing"` — including **2026-11-12** — shows **Your plan is being prepared.** It does not show the sample tasks. A date that is missing from `days` shows that same sentence. Nothing is carried forward from an earlier day, and nothing is marked late.

Each page reads that child's entry for the date when one is present, and otherwise uses the shared day. A shared preparing day can still hold a ready plan for one child. The other page keeps the preparing sentence. Add real tasks only after the work is approved. Put them in `days` in this file. Do not keep a second copy in the HTML.

## How to add an approved day

Edit only `daily/plans.json`.

Use a shared ready day when both children have the same work.

1. Find the date in `days`, or add one object to that array.
2. Set `"status": "ready"`.
3. Add the shared `materials` link for the print packet or approved page, if there is one.
4. Add the shared `tasks` array.
5. Leave `sample` as the preview. Do not copy it into `days`.

Shape of a shared ready day (this skeleton is not loaded by the page):

```json
{
  "date": "YYYY-MM-DD",
  "status": "ready",
  "materials": [
    { "label": "Print packet", "href": "https://example.com/approved-packet.pdf" }
  ],
  "tasks": [
    {
      "id": "short-id",
      "version": 1,
      "title": "Approved task title",
      "instruction": "What to do, in one short paragraph.",
      "steps": ["First concrete step.", "Next concrete step."],
      "finishedMeans": "What is true when the task is finished."
    }
  ]
}
```

A shared preparing day must not include shared `tasks` or `materials`:

```json
{ "date": "YYYY-MM-DD", "status": "preparing", "message": "Your plan is being prepared." }
```

To give one child a plan while the other page stays on that preparing sentence, add an optional `children` object on the day. Each page uses its own child's entry first. If that child has no entry, the page uses the shared day.

```json
{
  "date": "YYYY-MM-DD",
  "status": "preparing",
  "message": "Your plan is being prepared.",
  "children": {
    "cam": {
      "status": "ready",
      "tasks": [
        {
          "id": "short-id",
          "version": 1,
          "title": "Approved task title",
          "instruction": "What to do, in one short paragraph.",
          "steps": ["First concrete step."],
          "finishedMeans": "What is true when the task is finished.",
          "materials": [
            { "label": "Approved page", "href": "https://example.com/approved-page" }
          ]
        }
      ]
    }
  }
}
```

A child entry uses the same status rules as a shared day. A preparing child entry has no `tasks` and no `materials`. A ready child entry replaces the shared day for that child only, including materials. Put a link that belongs to one task on that task's `materials`. Leave `sample` unchanged.

### Fields

| Field | Role |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `children.cam` / `children.christian` | First name and which presentation to use. |
| `presentations.compact` / `presentations.guided` | Page wording. Same tasks, different layout and labels. Do not rank the two presentations against each other. |
| `days` | The only calendar plan. One object per date. |
| `days[].status` | Shared `preparing` or `ready`. This is what a page uses when that child has no entry for the date. |
| `days[].children.cam` / `days[].children.christian` | Optional plan for that child on that date. The matching page uses this entry instead of the shared day. |
| `days[].materials` | Shared links for a ready day. Safe `http:` or `https:` URLs, or a path relative to the `daily/` folder such as `packet.pdf`. No parent-folder paths, no script links, and no mail or phone links. |
| `tasks[].materials` | Optional links for that task only. Same address rules as day materials. |
| `tasks[].id` | Stable id, lowercase letters, numbers, and hyphens. |
| `tasks[].version` | Integer starting at 1. |
| `tasks[].steps` | At least one concrete step. Both pages show the steps. The guided page gives them more room. |
| `tasks[].finishedMeans` | The sentence that says when the task is finished. Both pages show it before the checkboxes. |
| `sample` | Preview only. |

Limits that keep the phone layout usable: 12 tasks on a day, 8 steps on a task, titles up to 120 characters, finished line up to 300 characters, note up to 280 characters.

### When to raise `version`

Raise `version` by 1 when the work or the finished line changes. The old check stays stored under the old version and no longer fills the new checkbox. Leave the version alone for a typo that does not change the task.

### What does not belong in this file

Do not put checks, notes, results, birthdates, full names, addresses, schedules, or private progress here. The file is the plan, and the repository is public. Shared task text is shown on every page that uses that day. A child entry is shown only on that child's page. Do not name the other child in either place. Keep the wording encouraging. Do not say the work is late, and do not say a child is behind. Do not include answers.

## What the child pages store

Storage is per browser, per child, per mode. It is not an account and it is not synced.

| Key | Page |
| --- | --- |
| `daily-checklist:v1:cam` | Cam's real checklist |
| `daily-checklist:v1:christian` | Christian's real checklist |
| `daily-checklist:v1:cam:preview` | Cam's preview |
| `daily-checklist:v1:christian:preview` | Christian's preview |

Shape of the saved value:

```json
{
  "schemaVersion": 1,
  "days": {
    "2026-11-12": {
      "note": "",
      "tasks": {
        "short-id": {
          "1": { "mark": "done", "updatedAt": "2026-11-12T15:00:00.000Z" }
        }
      }
    }
  }
}
```

`mark` is `done`, `help`, or `open`. The preview uses the date key `sample` instead of a calendar date.

The page opens on the device's local date. Another date is available from the date control, including earlier days. Saving today does not erase another day and does not move unfinished tasks onto today.

If the browser blocks storage, the page says so and still lets the child mark tasks for that visit. A refresh then starts blank. If an old save cannot be read, the page does not overwrite it.

The note and the checks are not put in the page address and are not written to the console.

## Send to Mom

The button calls `navigator.share` from the tap, with the summary title and text only. The child picks the app and the person on the device sheet, then presses Send there.

The page treats an opened sheet as **Sharing options opened.** It does not know whether anyone received the words. Cancel and failure leave the checks in place and explain what to do next. If the browser has no share sheet, use **Copy summary**. If the clipboard is blocked, the summary is shown in a box that can be selected.

A phone's share sheet may also attach the page address on its own. That address does not contain the checks or the note.

## Refresh and offline

Refreshing the page loads the files again and restores saved checks when storage is allowed and the browser can read the files (online, or still holding a saved copy). A first visit while offline fails if the browser has never stored the files. This folder does not add a service worker, and it does not sync later.

## Publish

GitHub Pages for this repository publishes the **`main`** branch, folder `/`, as a legacy site. `.nojekyll` is already at the repo root, so files are served as they are. There is no separate app server and no secret for these pages.

Merging into `main` publishes the site, including these new paths, to anyone who can open the public site. Review the plan text before that. Until then, use the preview routes from a local or review copy, not as live child links.

After a publish, edit `plans.json` on `main` when a new day is approved. The browser asks for a fresh copy of that file; the host may still take a short time to show the new build. Refresh the child page after the publish finishes.

## Tests

From the repository root, with Node and Chrome installed locally:

```
node --test daily/test/model.test.js
node daily/test/browser-runner.mjs
```

No package install is required. The browser runner serves the repo on localhost and checks the harness, both child pages, a 360px-wide layout, a desktop layout, keyboard focus, reload, and the blocked share sheet in headless Chrome.
