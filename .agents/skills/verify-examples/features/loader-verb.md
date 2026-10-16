# Loader verb

A bar above every page picks how the page's loader starts its queries: `prefetch`, `ensure` or `fetch`. The verb is the URL's first segment (`/ensure/issues/3`), so a page under each verb can be opened, compared and shared. A line next to the links says what the current verb waits for.

## Sub-features

- `verb-url` `/prefetch/…`, `/ensure/…`, `/fetch/…` serve the same pages. `/` and the verb-less `/issues…` URLs redirect to the same page under `prefetch`, keeping the search params. Any other first segment is the not-found page.
- `verb-bar` `navigation "Loader verb"` with links `prefetch`, `ensure`, `fetch` to the current page and search under that verb; the current one is `aria-current="page"`.
- `verb-links` every in-app link (header, rows, filters, back, previous, next) stays under the current verb.
- `verb-prefetch` never waits: a click opens the new page at once, onto skeletons. Its first HTML has skeletons, and the data streams in after.
- `verb-ensure` waits on a cache miss: the old page stays until the data lands. Stale cached data opens at once and refetches behind it. Its first HTML has the data, no skeletons.
- `verb-fetch` also waits on stale data: a revisit after the stale time keeps the old page until the refetch lands.
- `verb-404` under `ensure` and `fetch` the loader has the issue, so a missing one answers 404 with the not-found page. Under `prefetch` the page finds out when it reads the issue.

## How to get to it (user POV)

- The bar at the top of every page, under the header.

## Driving it with control-examples

Preconditions:

- Baseline state. For the waiting recipes, set `Latency` to `3 s` and `Stale time` to `0 ms` first, so the waits are long and every revisit is stale.

Name which page is on screen with this expression (`$PAGE`): `issue` once the issue page has rendered (skeletons count), `list` while the list is still shown.

```bash
PAGE='document.querySelector("main").innerText.includes("Showing") ? "list" : "issue"'
```

Commands:

- **Redirects.** `curl -s -o /dev/null -w '%{redirect_url}\n' $U/issues/3` is `$U/prefetch/issues/3`; `$U/issues?status=open` keeps `status=open`. `curl -s -o /dev/null -w '%{http_code}\n' $U/bogus/issues/3` is `404`.
- **Switch verb.** `$CE open "$U/prefetch/issues?status=open"; $CE click --role link --name ensure --exact`. `$CE eval location.pathname + location.search` is `/ensure/issues?status=open&sort=newest`, and `$CE snapshot | grep 'link "#'` rows link to `/ensure/issues/<id>`.
- **First HTML.** `curl -s $U/ensure/issues/3 | grep -c animate-pulse` is `0` and the title is in the HTML; under `/prefetch/` the count is above `0`.
- **prefetch opens at once.** `$CE open $U/prefetch/issues; $CE wait --role link --name '/^#41 /'; $CE click --role link --name '/^#41 /'; $CE eval "$PAGE"` is `issue` right away; the title fills in about 3 s later.
- **ensure waits once.** Same with `/ensure/`: `list` right after the click, `issue` once the data lands. Then `$CE click --role link --name 'All issues'`, wait for the rows, click `#41` again: `issue` at once, with the cached title.
- **fetch waits on stale data.** Same with `/fetch/`: the second click on `#41` shows `list` again until the refetch lands.
- **Missing issue.** `curl -s -o /dev/null -w '%{http_code}\n' $U/ensure/issues/999` is `404`; `$U/prefetch/issues/999` is `200` and its page shows `Nothing here.` once the issue query answers.

## Gotchas

- Only `tanstack-start` has the bar and the verb in its URLs so far. In the other three apps the pages live at `/issues…` and always `prefetch`.
- The URL changes as soon as you click, before `ensure` or `fetch` finish: check what's on screen (`$PAGE`), not `location.pathname`.
- The router reruns a revisited route's loader before showing it (`defaultStaleReloadMode: "blocking"`). Without that it would show the route's last loader data and rerun the loader behind it, and `fetch` would never wait.
- Scrolling or clicking far down the list can load its next page; those row skeletons belong to the list, not to the next page.
