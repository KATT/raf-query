import { queryOptions } from "@raf-query/react";

import { getPost, listComments } from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function commentsQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["comments", input.slug],
		queryFn: () => listComments(input.slug),
	});
}
