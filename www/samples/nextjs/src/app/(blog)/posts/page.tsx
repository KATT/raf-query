import { load, prefetch } from "@raf-query/react";

import { PostListInput } from "~/post-list-input.ts";
import { postsQuery } from "~/queries.ts";
import { getQueryClient } from "~/query-client.ts";

// #region page
export default async function PostsPage(props: {
	searchParams: Promise<Record<string, string | Array<string>>>;
}) {
	const input = PostListInput.parse(await props.searchParams);
	const [handles] = await load(getQueryClient(), {
		posts: prefetch(postsQuery, input),
	});
	// ...
	// #endregion
	void handles;
	return null;
}
