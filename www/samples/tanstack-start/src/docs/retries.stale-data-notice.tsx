import { type QueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

declare function formatTime(value: number): string;

// #region stale-data-notice
const [postPromise, postState] = useQuery(postQuery, loaderData.post);

{
	postState.error ? (
		<p role="status">
			Couldn't refresh. Showing data from {formatTime(postState.updatedAt)}.
		</p>
	) : null;
}
// #endregion
