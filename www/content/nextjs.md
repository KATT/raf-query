---
title: Next.js App Router
description: Start queries in React Server Components, send them to client components with HydrationBoundary, and refetch from the browser.
section: Server rendering
order: 3
---

In the App Router, server components play the part of loaders: they start queries and pass handles to client components. `@raf-query/react/rsc` provides the two pieces that connect them.

## Setup

A query client per request for server components, scoped by React's `cache()`:

```ts twoslash title="src/query-client.ts"
import { QueryClient, type QueryClientConfig } from "@raf-query/react";
import { cache } from "react";
// ---cut---
export const queryClientConfig = {
	defaults: { staleTime: 5000 },
} as const satisfies QueryClientConfig;

export const getQueryClient = cache(() => new QueryClient(queryClientConfig));
```

`QueryProvider` in the root layout, for client components:

```tsx twoslash title="src/app/layout.tsx"
import type { ReactNode } from "react";
declare const process: { env: { NODE_ENV?: string } };
// ---cut---
import { QueryDevtools } from "@raf-query/react/devtools";
import { QueryProvider } from "@raf-query/react/rsc";
import { queryClientConfig } from "~/query-client.ts";

export default function RootLayout(props: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<QueryProvider config={queryClientConfig}>
					{props.children}
					{process.env.NODE_ENV !== "production" ? <QueryDevtools /> : null}
				</QueryProvider>
			</body>
		</html>
	);
}
```

`QueryProvider` creates one client per server render and one per browser tab. Its `config` must be serializable, since it crosses from the server component layout to the client.

Mount DevTools only when `process.env.NODE_ENV !== "production"` so Next.js drops the panel from production builds. The [example app](./examples.md) always renders it, so the panel stays available in the deployed demo.

## Pages

A server component starts queries, and wraps what it renders in a `HydrationBoundary` that sends the request client's entries to the browser:

```tsx twoslash title="src/app/posts/[slug]/page.tsx"
import { HydrationBoundary } from "@raf-query/react/rsc";
import { Suspense } from "react";
import { commentsQuery, postQuery } from "./_twoslash.ts";
declare function getQueryClient(): import("@raf-query/react").QueryClient;
declare function CommentsSkeleton(): React.ReactNode;
declare function Comments(props: {
	handle: import("@raf-query/react").QueryHandle<typeof commentsQuery>;
}): React.ReactNode;
// ---cut---
export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const params = await props.params;
	const qc = getQueryClient();

	const comments = qc.prefetch(commentsQuery, { slug: params.slug });
	const post = await qc.fetch(postQuery, { slug: params.slug });

	return (
		<HydrationBoundary client={qc}>
			<article>
				<h1>{post.title}</h1>
				<Suspense fallback={<CommentsSkeleton />}>
					<Comments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}
```

```tsx twoslash title="src/components/comments.tsx"
import { type QueryHandle, useQuery } from "@raf-query/react";
import { commentsQuery } from "./_twoslash.ts";
// ---cut---
("use client");

export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [commentsPromise] = useQuery(commentsQuery, props.handle);
	// ...
}
```

- Render a `HydrationBoundary` in each server component that starts queries for client components. Entries already sent in this request are skipped, so nesting them is fine.
- Pending entries stream as promises through the RSC payload: the page's shell renders while `comments` loads.
- `fetch` and `ensure` wait for the same thing on the server. `await qc.fetch(...)` the data the server component renders itself. When it also hands the query to a client component, pass `await qc.ensure(...)`, so the client component gets the data from `useQuery` without a promise.

## Pending UI

While a link navigation is loading the next RSC payload, show pending state with Next.js — not [`useIsFetching`](./background-fetching-indicators.md#useisfetching). Render [`useLinkStatus`](https://nextjs.org/docs/app/api-reference/functions/use-link-status) as a child of the `Link` it tracks:

```tsx twoslash
import type { ReactNode } from "react";
declare function Link(props: {
	readonly children?: ReactNode;
	readonly href: string;
}): ReactNode;
declare function useLinkStatus(): { readonly pending: boolean };
declare function Spinner(): ReactNode;
// ---cut---
("use client");

function PendingHint() {
	const { pending } = useLinkStatus();
	return pending ? <Spinner /> : null;
}

<Link href="/issues">
	Issues
	<PendingHint />
</Link>;
```

Per-query background refetches after the page has rendered use `controls.isFetching`. See [Background fetching indicators](./background-fetching-indicators.md).

## Search params

Read `searchParams` in the page, validate them, and pass them as the input:

```tsx twoslash
import { queryOptions } from "@raf-query/react";
declare function getQueryClient(): import("@raf-query/react").QueryClient;
declare const IssueListInput: {
	parse: (value: Record<string, string | string[]>) => {
		status: "open" | "done";
	};
};
function issueListQuery(input: { status: "open" | "done" }) {
	return queryOptions({
		queryKey: ["issues", input],
		queryFn: async () => [] as Array<{ id: number }>,
	});
}
// ---cut---
export default async function IssuesPage(props: {
	searchParams: Promise<Record<string, string | string[]>>;
}) {
	const input = IssueListInput.parse(await props.searchParams);
	const qc = getQueryClient();
	const issues = qc.prefetch(issueListQuery, input);
	// ...
}
```

Changing search params with `<Link>` or `router.push` renders the page again on the server with the new input. See [URL state and pagination](./url-state-and-pagination.md) for what to show while it loads.

## Queries that start in the browser

`QueryProvider`'s server render starts no requests. A client component reading a query that no `HydrationBoundary` sent renders its Suspense fallback on the server, and the query loads in the browser. This is what happens with [`useWaterfall`](./request-waterfalls.md#render-time-inputs-usewaterfall) in a client component. That boundary renders in the browser through React's error recovery, with the digest Next.js uses for `ssr: false`, so Next.js doesn't report it.

## Server and browser requests

A factory's `queryFn` runs in two places, and has to reach the same data as the same user in both:

|                     | Server components                            | Browser                   |
| ------------------- | -------------------------------------------- | ------------------------- |
| When                | The page request                             | Refetches and later pages |
| `fetch("/api/...")` | Fails: there is no page origin to resolve it | Works                     |
| The user's cookies  | Yours to forward, from `headers()`           | Sent by the browser       |

Client components' server render starts no request, so it isn't a third place.

### An API in the same app

Have the API read the session from the request's cookies, and give factories one `apiFetch` with two files behind it: on the server it calls the API's handler in the process with the page request's cookies, and in the browser it's `fetch`. A [subpath import](https://nodejs.org/api/packages.html#subpath-imports) picks the file. Next.js resolves the `react-server` condition in server components, so the server file can import `next/headers` and your API, and neither reaches the browser bundle:

```json title="package.json"
{
	"imports": {
		"#api-fetch": {
			"react-server": "./src/api-fetch.server.ts",
			"default": "./src/api-fetch.ts"
		}
	}
}
```

```ts twoslash title="src/api-fetch.server.ts"
// @filename: next.d.ts
declare module "next/headers" {
	export function headers(): Promise<Headers>;
}
// @filename: api/handler.ts
export declare function handler(request: Request): Promise<Response>;
// @filename: api-fetch.server.ts
// ---cut---
import { headers } from "next/headers";

// The function `app/api/[...path]/route.ts` exports as `GET` and `POST`.
import { handler } from "./api/handler.ts";

export async function apiFetch(path: string, init?: RequestInit) {
	const forwarded = new Headers(init?.headers);
	const cookie = (await headers()).get("cookie");
	if (cookie !== null) {
		forwarded.set("cookie", cookie);
	}
	// The host is a placeholder: the handler routes by path.
	const url = new URL(path, "http://localhost");
	return handler(new Request(url, { ...init, headers: forwarded }));
}
```

```ts twoslash title="src/api-fetch.ts"
// The browser sends the page's cookies to its own origin.
export function apiFetch(path: string, init?: RequestInit) {
	return fetch(path, init);
}
```

```ts twoslash title="src/queries.ts"
// @filename: imports.d.ts
declare module "#api-fetch" {
	export function apiFetch(path: string, init?: RequestInit): Promise<Response>;
}
// @filename: queries.ts
// ---cut---
import { queryOptions } from "@raf-query/react";
import { apiFetch } from "#api-fetch";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: (context) =>
			apiFetch(`/api/issues/${input.id}`, { signal: context.signal }).then(
				(response) => response.json(),
			),
	});
}
```

- The API sees the same request from both sides, so it authenticates the same way. Forward only what it reads (`cookie`, `authorization`), not every header.
- Nothing needs the app's own origin, and server rendering doesn't open a second connection to itself.
- A typed client works the same way. [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) gives a Hono client the page request's cookies in `src/forwarded-headers.server.ts`.
- Reading `headers()` renders the page per request, as a page with per-user data must.

### An API on another origin

The server can call the same URL as the browser, but the browser's cookies belong to your origin, not the API's:

- **In server components**, forward the credentials it needs: read your session with `cookies()` and send, for example, an `Authorization` header.
- **In the browser**, either proxy it through a [Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route), so the request carries your cookies and the handler adds the same credentials, or send `credentials: "include"` to an API that allows your origin with CORS and sets its own cookies.

Pick the two implementations with the same `react-server` condition.

### Server actions

Factories can call server actions, and get both sides for free: server components call the function in the page request, and the browser posts to it with its cookies. Validate their arguments, since anyone can call them.

The browser runs a page's server actions one at a time, so refetches wait for each other and for any pending mutation. For parallel requests, call your API instead.

## Mutations

Write with a server action, then invalidate in the browser:

```tsx twoslash
import { QueryClient, queryOptions } from "@raf-query/react";
declare function updateIssue(formData: FormData): Promise<void>;
declare const id: number;
const qc = new QueryClient();
function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: async () => ({ id: input.id, title: "" }),
	});
}
// ---cut---
<form
	action={async (formData) => {
		await updateIssue(formData);
		await qc.invalidate(issueQuery, { id });
	}}
/>;
```

If the action also calls `revalidatePath` or `refresh()`, server components render again and send their entries, and the browser keeps whichever copy is newest.

## Server-only queries

A factory that imports server-only code (a database client) can't be imported by a client component, so it can't be read with `useQuery`. Render its data in a server component, or pass a plain promise prop and `use()` it on the client. Refresh it with `router.refresh()`.

To read it from client components too, put the server-only code behind an API, and reach that from the factory as in [An API in the same app](#an-api-in-the-same-app).

## Example

[`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same issue tracker as the TanStack Start example, so the two integrations can be compared side by side.
