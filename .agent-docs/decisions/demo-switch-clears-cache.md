# Demo switches that change how loads look clear the cache (human asked; which ones agent)

- A `Segmented` switch inside a demo shares the variant's query client. When it changes how a load or navigation looks, its `onChange` calls `qc.clear()` and `server.reset()`, and the `DemoBrowser` is keyed by the setting, so the demo starts over on its first page. Otherwise the cache warmed under the old setting hides the new one (`whilePending: "suspend"` on pages already visited renders them at once).
- Does it: `waterfalls` (strategy), `pagination` (`whilePending`).
- Doesn't: `polling` (the interval only changes how often the mounted read refetches), `infinite-scroll`'s filter links (finding the old list still cached is the point of that demo).
- Variants don't need this: each has its own client and server ([demo-variants-and-router.md](./demo-variants-and-router.md)).
