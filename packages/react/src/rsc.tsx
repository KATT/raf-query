import { canDehydrate, type DehydrateOptions, hashKey } from "@raf-query/core";
import type { ReactNode } from "react";

import { dehydrate, type QueryClient } from "./client.ts";
import { Hydrate } from "./hydrate.tsx";

const sentByClient = new WeakMap<QueryClient, Set<string>>();

/**
 * Server component: sends the request client's entries to the browser cache.
 * Pending entries cross as promises and stream in as they settle. Entries an
 * earlier boundary already sent in this request are skipped.
 *
 * ```tsx
 * const qc = getQueryClient();
 * const comments = qc.prefetch(commentsQuery, { slug });
 * return (
 *   <HydrationBoundary client={qc}>
 *     <Comments handle={comments} />
 *   </HydrationBoundary>
 * );
 * ```
 */
export function HydrationBoundary(props: {
	readonly children?: ReactNode;
	/** The request's server client (e.g. from React's `cache()`). */
	readonly client: QueryClient;
	readonly options?: DehydrateOptions;
}) {
	const client = props.client;
	let sent = sentByClient.get(client);
	if (!sent) {
		sent = new Set();
		sentByClient.set(client, sent);
	}
	const alreadySent = sent;
	const filter = props.options?.filter ?? canDehydrate;
	const state = dehydrate(client, {
		...props.options,
		filter: (query) => !alreadySent.has(query.hash) && filter(query),
	});
	for (const query of state.queries) {
		alreadySent.add(hashKey(query.key));
	}
	return <Hydrate state={state}>{props.children}</Hydrate>;
}
