/**
 * An Effect can only use services the client provides
 *
 * The client is built from the RPC client's layer. An Effect that needs
 * another service (`Analytics` here) can't be run under any boundary of that
 * client.
 */
import { Boundary } from "@raf-query/react/boundary";
import { Context, Effect } from "effect";

import { DocAccess } from "../src/boundaries.tsx";

class Analytics extends Context.Service<
	Analytics,
	{ readonly views: Effect.Effect<number> }
>()("Analytics") {}

export const Count = () => {
	const run = Boundary.useRun(DocAccess);
	return (
		<button
			onClick={() =>
				run(Effect.flatMap(Analytics, (analytics) => analytics.views))
			}
			type="button"
		>
			Count
		</button>
	);
};
