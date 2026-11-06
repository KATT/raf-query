import { ensureEntry, load } from "@raf-query/react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { meQuery } from "~/queries.ts";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async (args) => {
		const [handles, data] = await load(args.context.queryClient, {
			me: ensureEntry(meQuery),
		});
		if (data.me === null) {
			throw redirect({ to: "/login" });
		}
		return { me: handles.me };
	},
});
