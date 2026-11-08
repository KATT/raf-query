import { type Entry, rejected } from "@raf-query/core/internal";
import type { Thenable } from "@raf-query/core";

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

/**
 * Whether React rendered a Suspense boundary's fallback on the server, and
 * left its content to the browser, because a read bailed out: an error a
 * server render's `onError` and the browser's `onRecoverableError` can skip.
 * It checks the `digest`, which the browser's copy of the error keeps when
 * `onError` returns it.
 */
export function isBrowserRenderError(
	error: unknown,
): error is Error & { readonly digest: string } {
	return (
		error instanceof Error &&
		"digest" in error &&
		error.digest === clientRendering
	);
}

const reads = new WeakMap<Entry, Thenable<unknown>>();

/**
 * The read of an entry a server render can't settle: no data, no error and
 * no request in flight. Renders never start requests on the server, so it
 * rejects, and the boundary that `use()`s it renders in the browser.
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
