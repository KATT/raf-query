import { use } from "react";
import { type QueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

declare function formatTime(value: number): string;

// #region stale-data-notice
const [postThenable, controls] = useQuery(postQuery, loaderData.post);
const post = use(postThenable);

{
	controls.error ? (
		<p role="status">
			Couldn't refresh. Showing data from {formatTime(controls.updatedAt)}.
		</p>
	) : null;
}
// #endregion
