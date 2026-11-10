import {
	group,
	load,
	prefetch,
	type QueryClient,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { postQuery } from "~/queries.ts";

const permission = group("permission");

declare function Spinner(): React.ReactNode;

declare function ErrorNotice(props: {
	readonly error: unknown;
}): React.ReactNode;

declare function ReplyNotificationsToggle(props: {
	readonly permission: PermissionState | undefined;
}): React.ReactNode;

declare const queryClient: QueryClient;

// #region queries
export function permissionQuery(input: { name: PermissionName }) {
	return queryOptions({
		queryKey: permission(input.name),
		queryFn: async () => {
			const status = await navigator.permissions.query(input);
			return status.state;
		},
		// Only the browser has `navigator.permissions`.
		ssr: false,
	});
}

async function loader(slug: string) {
	const [handles] = await load(queryClient, {
		post: prefetch(postQuery, { slug }),
		permission: prefetch(permissionQuery, { name: "notifications" }),
	});
	return handles;
}
// #endregion queries

// #region component
function ReplyNotificationsSetting(props: {
	handle: QueryHandle<typeof permissionQuery>;
}) {
	const [permissionThenable] = useQuery(permissionQuery, props.handle);
	const permission =
		permissionThenable.status === "fulfilled"
			? permissionThenable.value
			: undefined;
	return <ReplyNotificationsToggle permission={permission} />;
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

export { loader, ReplyNotificationsSetting, PostTitle };
