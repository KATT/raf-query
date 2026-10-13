import { Effect } from "effect";

import type { Query } from "./query.ts";

/**
 * A {@link Config.wrapRequest} that runs each request, retries included, in
 * a `raf-query.request` span with a `raf_query.hash` attribute, under the
 * latest caller's span if it had one. A separate export, so apps that don't
 * trace don't bundle the tracer.
 *
 * @example new QueryClient({ wrapRequest: traceRequest })
 */
export function traceRequest<A, E>(
	request: Effect.Effect<A, E>,
	query: Query,
): Effect.Effect<A, E> {
	return Effect.withSpan(request, "raf-query.request", {
		attributes: { "raf_query.hash": query.hash },
	});
}
