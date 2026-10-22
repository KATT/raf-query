/**
 * A query can only use services the client provides
 *
 * The root's client is built from the RPC client's layer. A query that needs
 * another service (`Analytics` here) doesn't type-check at any boundary under
 * it.
 */
import { Context, Effect } from "effect";
import { Query } from "@raf-query/experimental-effect-query";

import { useDocAccess } from "../src/boundaries.tsx";

class Analytics extends Context.Service<
	Analytics,
	{ readonly views: Effect.Effect<number> }
>()("Analytics") {}

const views = Query.make({
	effect: Effect.flatMap(Analytics, (analytics) => analytics.views),
	key: ["views"],
});

export const Views = () => <p>{useDocAccess(views)} views</p>;
