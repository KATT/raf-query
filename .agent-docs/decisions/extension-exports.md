# The main entries export only what a plugin author must name (human)

- `@raf-query/core` (and `@raf-query/react` through it) exports `link`, `feature` and the types a package needs to write one: `Link`, `Feature`, `Operation` (the request a link gets), and `Target` / `QueryInfo` for a target over the `meta` a part declares. `QueryClient`, `QueryClientConfig`, `QueryMeta`, `Clock` (the testing docs write a fake one) and the bound builders' types stay public for apps.
- Internal, in `@raf-query/core/internal`: `Decl`, `RootTypes`, `DefaultTypes`, `MetaOf`, `RootOf`, `AnyLink`, `AnyFeature`, `ClientEvent`, `systemClock`, `EntryState`, `AnyFactory`, `AnyTarget`, and the built-in parts' declarations (`RetryMeta`, `PollingMeta`, `FocusRefetchMeta`, `ReconnectRefetchMeta`). `@raf-query/react` imports the ones it needs from there. They stay exported there so declaration emit can still name them.
- The test: `packages/core/src/extension.test-d.ts` writes a link, a feature that declares `meta` and subscribes to the client, and a target, importing only from `./index.ts`, and checks the root's `meta`.
- Lost: one flat public list of every type behind root typing (and an `/extend` subpath for it, which would have been a second entry for the same few names).
- Docs: `www/content/api-reference.md`, `www/content/links-and-features.md#links-and-features`.
