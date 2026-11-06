# Docs frame the cache as async data, not server-state-only (human asked)

- `www/content/client-state.md`, titled "What belongs in the cache" (slug `/docs/client-state`), says the cache is for **asynchronous data**: backend data and browser-only async work (`enabled: typeof window !== "undefined"`: push subscription, permission, service worker). Synchronous UI state stays in `useState` / URL / a small store.
- Why: "raf-query is only for data a backend owns" undersells the cache.
- Cross-links: overview "Where next", comparison "What's different", factory and defaults tables list `enabled`, SSR guide leads with push as the motivating example.
- Lost: the classic TanStack Query "server state vs client state" title as the page's own framing (the split appears in the table).
