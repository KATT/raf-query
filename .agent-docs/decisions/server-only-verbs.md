# Server-only code uses prefetch and revalidate, not swr (agent)

Human asked whether `ensure` (now `swr`) means anything in RSC, and whether React Router loaders are the same.

- **React server components and React Router `loader`s use `prefetch` and `revalidate`** in the docs, samples and examples. Both run only on the server, with a new client per request, so every query is a cache miss and `swr` waits exactly like `revalidate`. `swr`'s "block only the first visit" needs a client that outlives the navigation: TanStack Router loaders, which run in the browser after the first load, or a React Router `clientLoader` on the tab's client (React Router has no loader that runs in both places). See [react-router-client-only.md](./react-router-client-only.md).
- `revalidate` wins over `swr` there because it says what happens: the code waits for the data. Lost: keeping `swr` everywhere as the one blocking verb, which taught a cached-revisit behavior those frameworks never show.
- Docs: `www/content/starting-queries.md` ("Server-only code"), `react-server-components.md#pages` and `react-router.md#server-loaders`. Sample: `www/samples/react-router/app/routes/posts.$slug.tsx`.
- **The examples keep their `swr/` routes** in every app ([loader-verb-url.md](./loader-verb-url.md), human), so the three verbs can be compared. The header hint depends on `AppHeader`'s `loaders` prop: `"server"` (Next.js, React Router) says the `swr` route waits like `revalidate` on every navigation and to use `revalidate`.
