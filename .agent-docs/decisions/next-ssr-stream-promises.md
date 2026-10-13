# Next.js SSR-pass stream carries promises (agent, human asked)

Human: "make sure that next.js integration hydration thing can actually serialize promises and that we won't stream out the same query key twice / same for the tanstack one".

- **A pending entry crosses `QueryProvider`'s `RAF_QUERY_SSR` stream as a promise id**; a later chunk's `settled` list resolves it with data or rejects it with the redacted message. Chunks are JSON, so data must be JSON-serializable (a `Date` becomes a string). Flight (`HydrationBoundary`) and seroval (TanStack Router) keep rich types and needed no change.
- **`AwaitRequests`** (a suspense child of `QueryProvider`, server only) suspends until the server client has no request in flight, so React keeps the HTML open and every streamed promise settles in a later script, even one nothing on the server reads. It renders a fresh child after each wait because Fizz replays a retried component with the thenable it suspended on.
- **The browser rejects unsettled promises at `DOMContentLoaded`** (or right away if the document already finished parsing): a query started by a boundary after the server's last wait would otherwise hang its readers.
- **The page's chunks are recorded once at module level and replayed to every client React creates.** Strict Mode calls the `useState` initializer twice and keeps the first, so swapping `RAF_QUERY_SSR.push` per client left the kept client deaf to later chunks.
- **"Each key once"** stays the per-client `sent` set (`ssr-streaming.md`).
- **Tests (`packages/react/src/ssr.test.tsx`) go through the real transports**: Next's `ServerInsertedHTMLContext` around `react-dom/server.edge` (a full `<html><body>` document, or Fizz holds back the shell), and TanStack Router's `createRequestHandler` + `defaultStreamHandler`. The inline scripts run in happy-dom, which needs `enableJavaScriptEvaluation` in `@vitest-environment-options`.
