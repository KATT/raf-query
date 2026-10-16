# Server-only code uses prefetch and fetch, not ensure (agent)

Human asked whether `ensure` means anything in RSC, and whether React Router loaders are the same.

- **React server components and React Router `loader`s use `prefetch` and `fetch`** in the docs, samples and examples. Both run only on the server, with a new client per request, so every query is a cache miss and `ensure` waits exactly like `fetch` (a server client reuses cached data and refetches only `invalidate`d entries, `Entry.needsRefetch`). `ensure`'s "block only the first visit" needs a client that outlives the navigation: TanStack Router loaders, which run in the browser after the first load.
- `fetch` wins over `ensure` there because it says what happens: the code waits for the data. Lost: keeping `ensure` everywhere as the one blocking verb, which taught a cached-revisit behavior those frameworks never show.
- Docs: `www/content/starting-queries.md` ("Server-only code"), the bullets in `nextjs.md#pages` and `react-router.md#loaders`. Sample: `www/samples/react-router/app/routes/posts.$slug.tsx`.
