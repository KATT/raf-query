import { queryOptions } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { getCurrentUser, getOrg } from "../../../src/api";

function currentUserQuery() {
	return queryOptions({
		queryFn: () => getCurrentUser(),
		queryKey: ["user", "current"],
	});
}

function orgQuery(input: { orgId: string }) {
	return queryOptions({
		queryFn: () => getOrg(input),
		queryKey: ["org", input.orgId],
	});
}

// #region waterfall
export const Route = createFileRoute("/settings")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const user = await qc.fetch(currentUserQuery);
		return {
			org: qc.prefetch(orgQuery, { orgId: user.orgId }),
			user: qc.prefetch(currentUserQuery),
		};
	},
});
// #endregion
