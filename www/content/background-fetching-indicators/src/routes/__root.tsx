import { type QueryClient, useIsFetching } from "@raf-query/react";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { ProgressBar } from "../components/progress-bar";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	component: RootLayout,
});

function RootLayout() {
	return (
		<>
			<GlobalProgress />
			<Outlet />
		</>
	);
}

// #region global-progress
function GlobalProgress() {
	const fetching = useIsFetching();
	return fetching > 0 ? <ProgressBar /> : null;
}
// #endregion
