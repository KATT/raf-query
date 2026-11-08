import { group, infiniteQueryOptions, queryOptions } from "@raf-query/react";
import type { Post, PostPage } from "~/api.ts";

const posts = group("posts");
const builds = group("builds");

declare function fetchPostPage(cursor: number): Promise<PostPage>;

declare function fetchPostBySlug(slug: string): Promise<Post>;

declare const slug: string;

// #region intro
infiniteQueryOptions({
	queryKey: posts(),
	queryFn: (context) => fetchPostPage(context.pageParam),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});
queryOptions({ queryKey: posts(slug), queryFn: () => fetchPostBySlug(slug) });
queryOptions({
	queryKey: posts(slug),
	queryFn: async () => {
		const data = await fetchPostBySlug(slug);
		return data;
	},
});
queryOptions({
	queryKey: posts(slug),
	queryFn: (context) => fetchPostBySlug(context.queryKey[1]),
});
// #endregion

declare const somethingGoesWrong: boolean;

declare const somethingElseGoesWrong: boolean;

declare const data: unknown;

// #region handling-and-throwing-errors
queryOptions({
	queryKey: posts(slug),
	queryFn: async () => {
		if (somethingGoesWrong) {
			throw new Error("Oh no!");
		}
		if (somethingElseGoesWrong) {
			return Promise.reject(new Error("Oh no!"));
		}
		return data;
	},
});
// #endregion

// #region with-fetch-and-other-clients-that-dont-throw
queryOptions({
	queryKey: posts(slug),
	queryFn: async (context) => {
		const response = await fetch(`/posts/${slug}`, { signal: context.signal });
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status}`);
		}
		return response.json();
	},
});
// #endregion

declare function streamLines(signal: AbortSignal): AsyncIterable<string>;

// #region streaming
export function logQuery(input: { buildId: string }) {
	return queryOptions({
		queryKey: builds("log", input),
		queryFn: (context) => streamLines(context.signal),
		stream: {
			initial: [] as ReadonlyArray<string>,
			reduce: (lines, line) => [...lines, line],
		},
	});
}
// #endregion
