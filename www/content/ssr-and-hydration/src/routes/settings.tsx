import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { use } from "react";

import { PushSwitch } from "../components/push-switch";
import { pushStateQuery } from "../queries";

export const Route = createFileRoute("/settings")({
	loader: (args) => ({
		push: args.context.queryClient.prefetch(pushStateQuery, {
			channel: "releases",
		}),
	}),
	component: PushState,
});

// #region push-state
function PushState() {
	const loaderData = Route.useLoaderData();
	const [pushPromise, push] = useQuery(pushStateQuery, loaderData.push);
	if (push.isPending) {
		return <PushSwitch state="unknown" />;
	}
	return <PushSwitch state={use(pushPromise)} />;
}
// #endregion
