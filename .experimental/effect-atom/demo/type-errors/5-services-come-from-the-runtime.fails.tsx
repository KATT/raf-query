/**
 * An atom can only use services its runtime provides
 *
 * `DocsClient.runtime` is built from the RPC client's layer. An atom on it
 * that needs another service (`Analytics` here) doesn't type-check where it
 * is made, before any boundary reads it. tsc reports it against the last
 * overload, the `Stream` one: the `Analytics` in `Effect<number, never,
 * Analytics>` is what the runtime lacks.
 */
import { Context, Effect } from "effect";

import { DocsClient } from "../src/client.ts";

class Analytics extends Context.Service<
	Analytics,
	{ readonly views: Effect.Effect<number> }
>()("Analytics") {}

export const viewsAtom = DocsClient.runtime.atom(
	Effect.flatMap(Analytics, (analytics) => analytics.views),
);
