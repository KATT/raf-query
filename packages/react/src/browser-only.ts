import type { QueryClient } from "@raf-query/core";

/**
 * The digest Next.js gives a boundary that renders only in the browser
 * (`next/dynamic` with `ssr: false`); it doesn't report those errors.
 */
const clientRendering = "BAILOUT_TO_CLIENT_SIDE_RENDERING";

/**
 * Thrown by a server render's read of a query no `HydrationBoundary` sent.
 * React renders the nearest Suspense fallback, and the browser renders the
 * content.
 */
class BrowserRenderError extends Error {
	readonly digest = clientRendering;
	override readonly name = "BrowserRenderError";
}

/** Whether a render may start `client`'s requests. */
export function startsRequests(client: QueryClient): boolean {
	return !(client.isServer && client["~browserOnly"]);
}

/** Throw if a render on `client` must not start the request for `hash`. */
export function assertStartsRequests(client: QueryClient, hash: string): void {
	if (!startsRequests(client)) {
		throw new BrowserRenderError(
			`Query ${hash} loads in the browser: no HydrationBoundary sent it`,
		);
	}
}
