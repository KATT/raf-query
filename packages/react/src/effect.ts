import { Effect, Layer } from "effect";

import type { ServicesBuilder } from "./client.ts";

export { retrySchedule } from "@raf-query/core";

/**
 * A `QueryClient`'s services from a layer:
 * `new QueryClient({ services: fromLayer(IssueApiLive) })`. Built when the
 * client is created, so the layer must build synchronously; `dispose()`
 * runs its finalizers.
 */
export function fromLayer<TServices>(
	layer: Layer.Layer<TServices>,
): ServicesBuilder<TServices> {
	return (scope) => Effect.runSync(Layer.buildWithScope(layer, scope));
}
