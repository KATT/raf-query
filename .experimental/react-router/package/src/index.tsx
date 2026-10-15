"use client";

import {
	type DehydratedState,
	hashKey,
	hydrate,
	type HydrateOptions,
	Query,
	type QueryClient,
	useQueryClient,
} from "@raf-query/react";
import { type ReactNode, useEffect, useState } from "react";

/**
 * Entries the client has no data for, which children need during this
 * render, and entries it already shows, which must wait for a commit.
 */
function split(client: QueryClient, state: DehydratedState) {
	const shown = new Set(
		client
			.getAll()
			.filter((query) => Query.getUnsafe(query).hasData)
			.map((query) => query.hash),
	);
	const isShown = (query: DehydratedState["queries"][number]) =>
		shown.has(hashKey(query.key));
	return {
		deferred: { queries: state.queries.filter(isShown) },
		now: {
			queries: state.queries.filter((query) => !isShown(query)),
		},
	};
}

/**
 * Writes a loader's dehydrated cache into the browser (or SSR) client.
 * Use it with React Router Framework Mode: start queries in the loader,
 * `dehydrate` the request's client, and pass that state here.
 *
 * ```tsx
 * export async function loader(args: Route.LoaderArgs) {
 *   const qc = new QueryClient();
 *   const post = await qc.ensure(postQuery, { slug: args.params.slug });
 *   return { dehydratedState: dehydrate(qc), post };
 * }
 *
 * export default function Page(props: Route.ComponentProps) {
 *   const { dehydratedState, post } = props.loaderData;
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <Post handle={post} />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 *
 * Entries the client has no data for are written before its children
 * render, so their reads find the data (or the server's pending request).
 * Newer data for entries already on screen is written after commit, so a
 * render React throws away (an interrupted navigation) doesn't change the
 * current page. Pending entries cross as promises when the framework's
 * serializer supports them (React Router's Single Fetch does). Nested
 * boundaries are fine: each only writes what its `state` holds.
 */
export function HydrationBoundary(props: {
	readonly children?: ReactNode;
	readonly options?: HydrateOptions;
	readonly state: DehydratedState;
}) {
	const client = useQueryClient();
	const state = props.state;
	const options = props.options;
	const [hydrated, setHydrated] = useState<{
		readonly deferred: DehydratedState;
		readonly state: DehydratedState;
	}>();
	// Once per state. Cache notifications are deferred to a microtask, so
	// other components aren't updated mid-render.
	if (hydrated?.state !== state) {
		const parts = split(client, state);
		hydrate(client, parts.now, options);
		setHydrated({ deferred: parts.deferred, state });
	}
	const deferred = hydrated?.deferred;
	useEffect(() => {
		if (deferred && deferred.queries.length > 0) {
			hydrate(client, deferred, options);
		}
	}, [client, deferred, options]);
	return props.children;
}
