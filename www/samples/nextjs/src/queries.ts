// #region home
import { group, infiniteQueryOptions, queryOptions } from "@raf-query/react";

import { getPost, listComments } from "./api.ts";

// #endregion home
import { listPosts } from "./api.ts";

// #region home
const post = group("post");
const comments = group("comments");

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: post(input.slug),
		queryFn: () => getPost(input.slug),
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: comments(input.slug),
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
// #endregion home

const posts = group("posts");

/** One page of posts, by its number in the URL. */
export function postsQuery(input: { page: number }) {
	return queryOptions({
		queryKey: posts(input),
		queryFn: () => listPosts(input),
	});
}

// #region api-fetch
import { apiFetch } from "#api-fetch";

const authors = group("authors");

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryKey: authors(input.id),
		queryFn: (context) =>
			apiFetch(`/api/authors/${input.id}`, { signal: context.signal }).then(
				(response) => response.json(),
			),
	});
}
// #endregion
