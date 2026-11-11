import { queryOptions } from "~/raf.ts";
import { getPost } from "~/api.ts";
import { posts } from "~/queries.ts";

declare const input: { slug: string };

declare function getViewHistory(input: {
	readonly slug: string;
}): Promise<ReadonlyArray<number>>;

// #region structural-sharing
// The post's views for every hour since it went up: large, and replaced whole.
queryOptions({
	queryKey: posts("viewHistory", input.slug),
	queryFn: () => getViewHistory(input),
	structuralSharing: false,
});
// #endregion

// #region selecting-data
export function postTitleQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("title", input.slug),
		queryFn: () => getPost(input.slug),
		select: (post) => post.title,
	});
}
// #endregion
