import { DEFAULT_LOADER_VERB } from "@examples/db/types";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({
			params: { verb: DEFAULT_LOADER_VERB },
			to: "/$verb/issues",
		});
	},
});
