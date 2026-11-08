import {
	group,
	load,
	prefetch,
	queryOptions,
	revalidate,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

const user = group("user");
const org = group("org");

declare function getCurrentUser(): Promise<{ orgId: string }>;
declare function getOrg(input: { orgId: string }): Promise<{ id: string }>;

function currentUserQuery() {
	return queryOptions({
		queryKey: user("current"),
		queryFn: () => getCurrentUser(),
	});
}

function orgQuery(input: { orgId: string }) {
	return queryOptions({
		queryKey: org(input.orgId),
		queryFn: () => getOrg(input),
	});
}

// #region settings-waterfall
export const Route = createFileRoute("/settings")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const [userHandles, data] = await load(qc, {
			user: revalidate(currentUserQuery),
		});
		const [orgHandles] = await load(qc, {
			org: prefetch(orgQuery, { orgId: data.user.orgId }),
		});
		return { ...userHandles, ...orgHandles };
	},
});
// #endregion
