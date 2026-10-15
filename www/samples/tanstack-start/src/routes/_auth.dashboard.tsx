import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { use } from "react";

import { meQuery } from "~/queries.ts";

export const Route = createFileRoute("/_auth/dashboard")({
	component: Dashboard,
});

// #region dashboard
function Dashboard() {
	const context = Route.useRouteContext();
	const [mePromise] = useQuery(meQuery, context.me);
	const me = use(mePromise);
	return <p>{me.name}</p>;
}
// #endregion
