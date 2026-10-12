import { track } from "@raf-query/core";
import { use } from "react";

/**
 * Read a promise's result. A settled promise returns its value, or throws
 * its error, synchronously, so this works outside render too: in an event
 * handler, an action, or an effect. A pending one suspends through `use()`,
 * which only works during render; outside render it fails like `use()`.
 *
 * ```tsx
 * const [postPromise] = useQuery(postQuery, loaderData.post);
 * const post = unwrap(postPromise);
 * ```
 *
 * Promises from `useQuery` are already fulfilled once the cache has data.
 * Other promises (props from a server component) are tracked on first read,
 * so that read suspends until they settle.
 */
export function unwrap<T>(promise: Promise<T>): T {
	const thenable = track(promise);
	switch (thenable.status) {
		case "fulfilled": {
			return thenable.value;
		}
		case "rejected": {
			throw thenable.reason;
		}
		case "pending": {
			// `use()` has no call-order state, so a non-hook may call it. A
			// fulfilled thenable never changes, so memoizing `unwrap(promise)`
			// (React Compiler) returns the same value React would.
			// oxlint-disable-next-line react-hooks/rules-of-hooks
			return use(thenable);
		}
	}
}
