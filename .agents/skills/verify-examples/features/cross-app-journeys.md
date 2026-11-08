# Cross-app journeys

One user journey across the list, the issue page and a write, run in every app, then the differences between the apps that are on purpose. Run it last in a full sweep, and on its own to check a change to `examples/.shared/` or `packages/` quickly.

## Sub-features

- `journey-triage` filter, sort, open an issue, change its status, see the counts follow, put it back.
- `journey-parity` the three apps give the same results; the differences are the ones listed in Gotchas.

## How to get to it (user POV)

- `/issues` in each app, ports 3000, 3001 and 3006.

## Driving it with control-examples

Preconditions:

- Baseline state in all three apps (seed counts In progress 16, Closed 9; `#1` is `Settings page loses input on refresh`, In progress).

Commands, for each `U` in `http://localhost:3000 http://localhost:3001 http://localhost:3006`:

- **Filter and sort.** `$CE open $U/issues; $CE click --role link --name '/^In progress \d+$/'; $CE wait --text 'of 16 issues'; $CE click --role link --name Oldest --exact; $CE wait --eval 'location.search.includes("sort=oldest") && !document.querySelector("[aria-busy=true]")'`. `$CE eval location.search` has `status=in_progress` and `sort=oldest`.
- **Open the oldest.** `$CE click --role link --name '/^#1 /'; $CE wait --role textbox --name Title --exact; $CE wait --role button --name 'Change status'`. `/prefetch/issues/1`, `button "Previous issue" [disabled]`, `button "Status: In progress. Change status"`.
- **Close it.** `$CE click --role button --name 'Change status'; $CE click --role menuitem --name Closed --exact`, wait a second, `$CE click --role link --name 'All issues'; $CE wait --text Showing`. `$CE snapshot | grep -E '^link "(In progress|Closed) [0-9]+"'` gives `In progress 15` and `Closed 10`.
- **Put it back.** `$CE open $U/issues/1`, set the status to `In progress`, then `$CE open $U/issues`: `In progress 16`, `Closed 9`.

Record one line per app with the counts before, during and after. All three must match.

## Gotchas

Where the apps differ on purpose:

| What                          | `tanstack-start`                                       | `nextjs`                                                       | `react-router`                                                                    |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Data layer                    | REST `/api/*`                                          | REST `/api/*`                                                  | REST `/api/*`                                                                     |
| `/issues` URL                 | redirects to `/prefetch/issues?sort=newest&status=all` | redirects to `/prefetch/issues`; no params until a filter link | redirects to `/prefetch/issues`; leaves defaults out (`?status=open&sort=oldest`) |
| Loader verb                   | in the URL (`/swr/issues/1`)                           | in the URL; `swr` waits like `revalidate` on every visit       | as `nextjs`                                                                       |
| Prefetch options              | Off, On intent, In viewport, On render                 | no On render; production builds only                           | as `tanstack-start`                                                               |
| Client navigation             | browser loaders                                        | server components (RSC fetch)                                  | server loaders (`.data` fetch)                                                    |
| Missing issue status (`curl`) | 200                                                    | 200                                                            | 500                                                                               |

- In `nextjs` the old page stays on screen until the new page's server payload arrives. Wait for a control only the new page has (`textbox "Title"`) before acting on one both pages have (a status menu).
- Each app has its own in-memory data. A write in one app doesn't show in another, and restarting one app's server reseeds only that app.
