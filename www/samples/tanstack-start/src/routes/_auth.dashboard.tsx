import { use } from "react";
import { useQuery } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { meQuery } from "~/queries.ts";

export const Route = createFileRoute("/_auth/dashboard")({
	component: Dashboard,
});

// #region dashboard
function Dashboard() {
	const context = Route.useRouteContext();
	const [meThenable] = useQuery(meQuery, context.me);
	const me = use(meThenable);
	return <p>{me?.name}</p>;
}
// #endregion
