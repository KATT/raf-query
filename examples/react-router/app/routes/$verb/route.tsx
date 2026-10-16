import { parseLoaderVerb } from "~/loader-verb.ts";

import type { Route } from "./+types/route";

/**
 * `/prefetch/…`, `/ensure/…`, `/fetch/…`: the first segment picks how the
 * pages' loaders start their queries.
 */
export function loader(args: Route.LoaderArgs) {
	return { verb: parseLoaderVerb(args.params.verb) };
}
