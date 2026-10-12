import type { DehydrateOptions } from "@raf-query/core";
import type { ReactNode } from "react";

import { dehydrate, type QueryClient } from "./client.ts";
import { Hydrate } from "./hydrate.tsx";
import { sentHashes } from "./sent.ts";

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
	const state = dehydrate(client, {
		sent: sentHashes(client),
		...props.options,
	});
	return <Hydrate state={state}>{props.children}</Hydrate>;
}
