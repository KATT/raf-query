import { useQuery } from "@tanstack/react-query";

declare function ReplyNotificationsToggle(props: {
	readonly permission: PermissionState | undefined;
}): React.ReactNode;

// #region tanstack
function ReplyNotificationsSetting() {
	const { data } = useQuery({
		queryKey: ["permission", "notifications"],
		queryFn: async () => {
			const status = await navigator.permissions.query({
				name: "notifications",
			});
			return status.state;
		},
		// Only the browser has `navigator.permissions`.
		enabled: typeof window !== "undefined",
	});
	return <ReplyNotificationsToggle permission={data} />;
}
// #endregion
