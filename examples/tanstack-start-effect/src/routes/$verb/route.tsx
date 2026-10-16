import { LoaderVerb } from "@examples/db/types";
import { createFileRoute, notFound } from "@tanstack/react-router";

/**
 * `/prefetch/…`, `/ensure/…`, `/fetch/…`: the first segment picks how the
 * pages' loaders start their queries.
 */
export const Route = createFileRoute("/$verb")({
	params: {
		parse: (params) => {
			const verb = LoaderVerb.safeParse(params.verb);
			if (!verb.success) {
				throw notFound();
			}
			return { verb: verb.data };
		},
	},
});
