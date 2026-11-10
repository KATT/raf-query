import {
	group,
	infiniteQueryOptions,
	type QueryClient,
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

interface Api {
	getPost(slug: string, signal: AbortSignal): Promise<Post>;
}

// #region client
// One API client per query client: on the server, per request.
const apis = new WeakMap<QueryClient, Api>();

export function provideApi(queryClient: QueryClient, api: Api) {
	apis.set(queryClient, api);
}

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: (context) => {
			const api = apis.get(context.client);
			if (!api) {
				throw new Error("No API for this query client");
			}
			return api.getPost(input.slug, context.signal);
		},
	});
}
// #endregion client
