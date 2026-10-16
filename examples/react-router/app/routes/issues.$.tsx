import { DEFAULT_LOADER_VERB } from "@examples/db/types";
import { redirect } from "react-router";

import type { Route } from "./+types/issues.$";

/** `/issues…` without a verb: the same page under the default one. */
export function loader(args: Route.LoaderArgs) {
	const url = new URL(args.request.url);
	return redirect(`/${DEFAULT_LOADER_VERB}${url.pathname}${url.search}`);
}
