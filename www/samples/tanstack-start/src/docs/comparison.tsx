import {
	load,
	prefetchEntry,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

declare function NotificationsToggle(props: {
	readonly permission: PermissionState | undefined;
}): React.ReactNode;

// #region queries
export function permissionQuery(input: { name: PermissionName }) {
	return queryOptions({
		queryKey: ["permission", input.name],
		queryFn: async () => {
			const status = await navigator.permissions.query(input);
			return status.state;
		},
		// Only the browser has `navigator.permissions`.
		enabled: typeof window !== "undefined",
	});
}
// #endregion queries

// #region route
export const Route = createFileRoute("/settings")({
	loader: async ({ context }) => {
		const [handles] = await load(context.queryClient, {
			notifications: prefetchEntry(permissionQuery, { name: "notifications" }),
		});
		return handles;
	},
	component: NotificationsSetting,
});
// #endregion route

declare const loaderData: {
	notifications: QueryHandle<typeof permissionQuery>;
};

// #region component
function NotificationsSetting() {
	// The server can't read a browser-only query: it sends the fallback.
	return (
		<Suspense fallback={<NotificationsToggle permission={undefined} />}>
			<Permission />
		</Suspense>
	);
}

function Permission() {
	const [promise] = useQuery(permissionQuery, loaderData.notifications);
	const permission = promise.status === "fulfilled" ? promise.value : undefined;
	return <NotificationsToggle permission={permission} />;
}
// #endregion component

// #region thenable
const [promise, controls] = useQuery(permissionQuery, loaderData.notifications);
const data = promise.status === "fulfilled" ? promise.value : undefined;
//    ^?
const error = promise.status === "rejected" ? promise.reason : undefined;
const { isFetching, isPending } = controls;
// #endregion thenable
