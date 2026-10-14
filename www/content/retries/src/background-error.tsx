import { type EnsuredQueryHandle, useQuery } from "@raf-query/react";

import { postQuery } from "./queries";

declare const loaderData: { post: EnsuredQueryHandle<typeof postQuery> };

function formatTime(value: number): string {
	return new Date(value).toISOString();
}

export function BackgroundErrorHint() {
	// #region background
	const [post, postState] = useQuery(postQuery, loaderData.post);

	return (
		<>
			{postState.error ? (
				<p role="status">
					{"Could not refresh. Showing data from "}
					{formatTime(postState.updatedAt)}.
				</p>
			) : null}
			<p>{post.title}</p>
		</>
	);
	// #endregion
}
