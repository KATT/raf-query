import type { QueryClient } from "./client.ts";

const sentByClient = new WeakMap<QueryClient, Set<string>>();

/**
 * Hashes of a client's entries that already have a way to the browser
 * cache: sent by an earlier `HydrationBoundary` of the request, or, in the
 * SSR pass, hydrated from the RSC payload or streamed by `QueryProvider`.
 * Integrations pass it as `sent`, so each entry crosses once.
 */
export function sentHashes(client: QueryClient): Set<string> {
	let sent = sentByClient.get(client);
	if (!sent) {
		sent = new Set();
		sentByClient.set(client, sent);
	}
	return sent;
}
