import { queryOptions } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { getCurrentOrg, getCurrentUser } from "../../../src/api";

function currentUserQuery() {
	return queryOptions({
		queryFn: () => getCurrentUser(),
		queryKey: ["user", "current"],
	});
}

// #region parallel
export function currentOrgQuery() {
	return queryOptions({
		queryKey: ["org", "current"],
		queryFn: () => getCurrentOrg(),
	});
}

export const Route = createFileRoute("/settings")({
	loader: (args) => {
		const qc = args.context.queryClient;
		return {
			org: qc.prefetch(currentOrgQuery),
			user: qc.prefetch(currentUserQuery),
		};
	},
});
// #endregion
