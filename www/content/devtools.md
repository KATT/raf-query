---
title: Devtools
description: Inspect the browser's query cache and recent loads as they change, refetch, reset or remove entries, and keep the panel out of production bundles.
section: Reference
order: 1
---

`@raf-query/react/devtools` shows the browser's query cache as it changes. Render `QueryDevtools` anywhere under the provider, and only mount it in development so bundlers drop the panel from production builds.

On Vite and TanStack Start, use [`import.meta.env.DEV`](https://vite.dev/guide/env-and-mode#built-in-constants):

```sample
tanstack-start/src/docs/devtools.tsx#intro
```

On Next.js, use `process.env.NODE_ENV !== "production"` instead. Either check is replaced at build time, so the production branch is empty and the panel's code is tree-shaken. There is no separate production entry: omit the element (or the whole import) whenever you don't want the panel.

Both components are client components, so a Next.js server component layout can render them, inside the `Providers` that holds the `QueryClientProvider`. See [React Server Components](./react-server-components.md).

Every demo on this site has a **Devtools** tab in its expanded view, showing the demo's own cache. The [example apps](./examples.md) always render `<QueryDevtools />`, so the panel is available in the deployed demos as well as in local `dev`.

## The panel

A button in the corner opens a panel docked to the bottom of the viewport. It lists every entry by its key, with its number of readers (mounted components reading it) and its status:

| Status     | Meaning                                             |
| ---------- | --------------------------------------------------- |
| `fetching` | A request is in flight                              |
| `error`    | The last request failed                             |
| `active`   | Has data, and a component reads it                  |
| `inactive` | Has data, and nothing reads it: removed at `gcTime` |
| `pending`  | No data yet                                         |

Below the entries, **Loads** lists the latest `load` calls, newest first, with each entry's name and kind (`prefetch`, `swr` or `revalidate`). Loads are recorded in development builds only.

Select an entry to see its data (or its error) and when it was last updated, and to act on it:

- **Refetch** it now, aborting a request in flight.
- **Reset** it: drop its data, so readers suspend and refetch.
- **Remove** it from the cache.

## Props

`QueryDevtools` takes, all optional:

| Prop             | Values (default first)                                         |
| ---------------- | -------------------------------------------------------------- |
| `client`         | The nearest `QueryClientProvider`'s client, or another one     |
| `initialIsOpen`  | `false`, `true`: whether the panel is open on the first render |
| `buttonPosition` | `"bottom-right"`, `"bottom-left"`, `"top-right"`, `"top-left"` |

## Embedding the panel

`QueryDevtoolsPanel` is the panel alone, to place in your own layout. It takes `client`, `style` for its root element (its height, say), and `onClose`, which adds a close button.

```tsx twoslash
import { QueryDevtoolsPanel } from "@raf-query/react/devtools";
// ---cut---
function Panel() {
	return <QueryDevtoolsPanel style={{ height: 400 }} />;
}
```

Outside a `QueryClientProvider`, pass `client`, or the panel throws.
