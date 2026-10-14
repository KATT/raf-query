# Example apps use production DevTools (agent)

- Both example apps import `QueryDevtools` from `@raf-query/react/devtools/production` (parent agent, 2026-10-14), so the panel ships in deployed demos and in local `dev`. The default `@raf-query/react/devtools` entry still drops the panel when `NODE_ENV === "production"`.
- Docs setup snippets for Next.js and TanStack Start match the examples and note the trade-off.
