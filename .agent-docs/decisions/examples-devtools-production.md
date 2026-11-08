# Example apps always mount QueryDevtools (agent)

- Every example app renders `<QueryDevtools />` from `@raf-query/react` with no `NODE_ENV` guard (parent agent, 2026-10-14), so the panel is in deployed demos and in local `dev`. Ordinary apps omit the element in production to tree-shake it — see [devtools.md](./devtools.md).
