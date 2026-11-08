import {
	type ErrorOf,
	fail,
	group,
	infiniteQueryOptions,
	queryOptions,
} from "@raf-query/react";
import type { Post, PostComment, PostPage } from "~/api.ts";

const posts = group("posts");

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

// #region expected-errors
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts(input.slug),
		queryFn: async (context) => {
			const response = await fetch(`/api/posts/${input.slug}`, {
				signal: context.signal,
			});
			if (response.status === 404) {
				return fail({ _tag: "NotFound", slug: input.slug });
			}
			if (!response.ok) {
				throw new Error(`Request failed: ${response.status}`);
			}
			return (await response.json()) as Post;
		},
	});
}

type PostError = ErrorOf<typeof postQuery>;
//   ^?
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

declare function streamComments(
	slug: string,
	signal: AbortSignal,
): AsyncIterable<PostComment>;

// #region streaming
export function liveCommentsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("liveComments", input.slug),
		queryFn: (context) => streamComments(input.slug, context.signal),
		stream: {
			initial: [] as ReadonlyArray<PostComment>,
			reduce: (comments, comment) => [...comments, comment],
		},
	});
}
// #endregion
