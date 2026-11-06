# QueryProvider on the main entry (human asked)

Human, with `HydrationBoundary` on the main entry: "Do same for query provider if possible".

- **`import { QueryProvider } from "@raf-query/react"`**, exported from `index-shared.ts`, so both the default and the `react-server` entry have it. It's a `"use client"` component, so a server component layout and a client component import the same module; no condition needed.
- **There is no `@raf-query/react/rsc`**, at the human's request. The "/rsc is better" quoted in [rsc-only-hydration.md](./rsc-only-hydration.md) compares `/rsc` with `/next`, not with the main entry.
- **No payload:** `browser-only.ts` is reachable from `useQuery` anyway, and apps that don't render `QueryProvider` tree-shake it.
- Lost: a separate entry that said "this is the RSC provider". The name and the docs (`react-server-components.md`, API reference) say it instead, next to `QueryClientProvider`.
