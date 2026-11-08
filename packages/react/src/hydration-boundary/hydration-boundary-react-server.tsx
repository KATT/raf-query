import { dehydrate, type QueryClient } from "@raf-query/core";

import { Hydrate } from "./hydrate.tsx";
import type { HydrationBoundaryProps } from "./hydration-boundary.tsx";

const sentByClient = new WeakMap<QueryClient, Set<string>>();

/**
 * Hashes of the request client's entries an earlier `HydrationBoundary`
 * already sent, so each entry crosses once per request.
 */
function sentHashes(client: QueryClient): Set<string> {
	const sent = sentByClient.get(client) ?? new Set<string>();
	sentByClient.set(client, sent);
	return sent;
}

/**
 * `HydrationBoundary` in server components (the `react-server` export
 * condition). With `client`, sends the request client's entries to the
 * browser cache: pending entries cross as promises and stream in as they
 * settle, and entries an earlier boundary already sent in this request are
 * skipped. With `state`, writes that state, as the browser version does.
 *
 * It also marks the client components' server render: from there on, a read
 * of a query nothing sent renders its Suspense fallback on the server and
 * loads in the browser, instead of fetching where nothing would send it.
 *
 * @see https://raf-query.katt.dev/docs/react-server-components#setup
 */
export function HydrationBoundary(props: HydrationBoundaryProps) {
	const client = props.client;
	const state =
		client === undefined
			? props.state
			: dehydrate(client, { ...props.options, sent: sentHashes(client) });
	return (
		<Hydrate fromServerComponents state={state}>
			{props.children}
		</Hydrate>
	);
}
