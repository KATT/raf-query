---
title: Background fetching indicators
description: Show that a query is refreshing with isFetching, and add an app-wide progress indicator with useIsFetching.
section: Guides
order: 17
---

A query's first load suspends, so Suspense fallbacks cover it. Later requests (refetches on navigation, focus, invalidation) happen in the background, while the old data stays on screen. Two tools tell the user something is happening.

## One query: isFetching

`isFetching` on the reader's controls is `true` while any request for the query is in flight, first loads included:

```tsx twoslash
import { type EnsuredQueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "./_twoslash.ts";
declare function Spinner(props: { readonly label: string }): React.ReactNode;
// ---cut---
function Post(props: { handle: EnsuredQueryHandle<typeof postQuery> }) {
	const [post, postState] = useQuery(postQuery, props.handle);
	return (
		<article aria-busy={postState.isFetching}>
			<h1>
				{post.title}
				{postState.isFetching ? <Spinner label="Refreshing" /> : null}
			</h1>
			<p>{post.body}</p>
		</article>
	);
}
```

Controls are tracked: only components that read `isFetching` re-render when it changes. A parent that just passes the promise down stays put during background refetches.

## The whole app: useIsFetching

`useIsFetching()` returns how many queries have a request in flight, and re-renders when the number changes. Render it once in the root layout for a global indicator:

```tsx twoslash
import { useIsFetching } from "@raf-query/react";
declare function ProgressBar(): React.ReactNode;
// ---cut---
function GlobalProgress() {
	const fetching = useIsFetching();
	return fetching > 0 ? <ProgressBar /> : null;
}
```

Pass a filter to count only some queries:

```ts twoslash
import { useIsFetching } from "@raf-query/react";
// ---cut---
const savingComments = useIsFetching({ queryKey: ["comments"] });
```

It's always `0` on the server and during hydration, so the indicator never appears in server HTML. Outside React, `qc.isFetching(filter?)` returns the same number.

Refetch the queries below, together or one at a time, and watch both indicators:

```demo
fetching-indicators
```

## Avoiding flashes

On a fast connection, a background refetch can finish in 50 ms, and a spinner that flashes for that long is more distracting than helpful. Delay it with CSS, so it only appears for slower requests:

```css
.spinner {
	animation: fade-in 0s 300ms both;
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
}
```

## Navigations

A navigation is not a background fetch: it's a transition. In TanStack Router and Next.js, use the router's pending state for the navigation itself (`useRouterState({ select: (state) => state.isLoading })`, or `useLinkStatus` in Next.js). `isFetching` and `useIsFetching` cover what happens after the page has rendered.
