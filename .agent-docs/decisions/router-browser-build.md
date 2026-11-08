# Browser build of the TanStack Router integration (agent, human asked)

- Human: minimise bundle size. **`@raf-query/react/tanstack-router` has a `browser` export condition** pointing at a client-only module (`tanstack-router-browser.ts`; the shared half is `tanstack-router-shared.ts`). The browser reads the server's stream with a `for await` loop and hydrates each chunk, so the server's `dehydrateStream` stays out of the app.
- Server runtimes are listed first (`workerd`, `worker`, `node`, `deno`, `bun`), since Cloudflare builds also set `browser`. Router-core's `isServer` export orders them the same way.
- Lost: a runtime `router.isServer` branch, or router-core's build-time `isServer`, in one module. Neither shook: rolldown keeps the server branch's imports until minification, which can't drop calls whose pure annotations were lost.
