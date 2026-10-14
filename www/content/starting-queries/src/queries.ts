import { queryOptions } from "@raf-query/react";

import { getAuthor, getPost } from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function authorQuery(input: { id: string }) {
	return queryOptions({
		queryKey: ["author", input.id],
		queryFn: () => getAuthor(input.id),
	});
}

export function commentsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["comments", input.slug],
		queryFn: () =>
			fetch(`/api/posts/${input.slug}/comments`).then((response) =>
				response.json(),
			),
	});
}
