import {
	group,
	type QueryHandle,
	queryOptions,
	useQuery,
	waterfallHandle,
} from "@raf-query/react";
import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";
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
	});
}
// #endregion queries

// #region component
function NotificationsSetting() {
	// `false` on the server and while hydrating, `true` after.
	const hydrated = useHydrated();
	if (!hydrated) {
		return <NotificationsToggle permission={undefined} />;
	}
	return <NotificationsPermission />;
}

function NotificationsPermission() {
	// Only the browser has `navigator.permissions`, so the handle is built here.
	const [handle] = useState(() =>
		waterfallHandle(permissionQuery, { name: "notifications" }),
	);
	const [permissionThenable] = useQuery(permissionQuery, handle);
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

export { NotificationsSetting, PostTitle };
