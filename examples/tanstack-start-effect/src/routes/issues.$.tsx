import { DEFAULT_LOADER_VERB } from "@examples/db/types";
import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/issues…` without a verb: the same page under the default one. */
export const Route = createFileRoute("/issues/$")({
	beforeLoad: (args) => {
		throw redirect({ href: `/${DEFAULT_LOADER_VERB}${args.location.href}` });
	},
});
