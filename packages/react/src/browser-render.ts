import { type Entry, rejected } from "@raf-query/core/internal";
import type { QueryClient, Thenable } from "@raf-query/core";

/**
 * The digest Next.js gives a boundary that renders only in the browser
 * (`next/dynamic` with `ssr: false`); it doesn't report those errors.
 */
const clientRendering = "BAILOUT_TO_CLIENT_SIDE_RENDERING";

/**
 * What a server render's read rejects with when nothing on the server will
 * settle the query. `use()` throws it, React renders the nearest Suspense
 * fallback, and the browser renders the content.
 */
class BrowserRenderError extends Error {
	readonly digest = clientRendering;
	override readonly name = "BrowserRenderError";
}

/** Server clients a server components' `HydrationBoundary` feeds. */
const fedByServerComponents = new WeakSet<QueryClient>();

/**
 * Mark a server render's client as fed by server components: from now on,
 * its renders leave a query nothing started to the browser instead of
 * fetching it, since nothing would send that request's data down.
 */
export function markFedByServerComponents(client: QueryClient): void {
	if (client.isServer) {
		fedByServerComponents.add(client);
	}
}

/** Whether a render on `client` leaves a query nothing started to the browser. */
export function leavesUnstartedToBrowser(client: QueryClient): boolean {
	return fedByServerComponents.has(client);
}

const reads = new WeakMap<Entry, Thenable<unknown>>();

/**
 * The read of an entry a server render won't settle: no data, no error and
 * no request in flight. It rejects, and the boundary that `use()`s it renders
 * in the browser.
 */
export function browserRender(entry: Entry): Thenable<unknown> {
	let read = reads.get(entry);
	if (!read) {
		read = rejected(
			new BrowserRenderError(
				`Query ${entry.hash} loads in the browser: nothing started it on the server`,
			),
		);
		reads.set(entry, read);
	}
	return read;
}
