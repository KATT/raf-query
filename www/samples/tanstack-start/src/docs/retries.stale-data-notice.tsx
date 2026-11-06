import { type DefinedQueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: DefinedQueryHandle<typeof postQuery> };

declare function formatTime(value: number): string;

// #region stale-data-notice
const [post, controls] = useQuery(postQuery, loaderData.post);

{
	controls.error ? (
		<p role="status">
			Couldn't refresh. Showing data from {formatTime(controls.updatedAt)}.
		</p>
	) : null;
}
// #endregion
