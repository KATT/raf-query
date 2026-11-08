import {
	group,
	load,
	prefetchEntry,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";
import { postQuery } from "~/queries.ts";

const permission = group("permission");

declare function Spinner(): React.ReactNode;

declare function ErrorNotice(props: {
	readonly error: unknown;
}): React.ReactNode;

declare function NotificationsToggle(props: {
	readonly permission: PermissionState | undefined;
}): React.ReactNode;

// #region queries
export function permissionQuery(input: { name: PermissionName }) {
	return queryOptions({
		queryKey: permission(input.name),
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
	const [permissionThenable] = useQuery(
		permissionQuery,
		loaderData.notifications,
	);
	const permission =
		permissionThenable.status === "fulfilled"
			? permissionThenable.value
			: undefined;
	return <NotificationsToggle permission={permission} />;
}
// #endregion component

// #region thenable
function PostTitle(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postThenable, postState] = useQuery(postQuery, props.handle);
	switch (postThenable.status) {
		case "pending":
			return <Spinner />;
		case "rejected":
			return <ErrorNotice error={postThenable.reason} />;
		case "fulfilled":
			return (
				<h1 aria-busy={postState.isFetching}>{postThenable.value.title}</h1>
			);
	}
}
// #endregion thenable

export { PostTitle };
