import { queryOptions } from "@raf-query/react";

import { getPost, listTodos } from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
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

export function todosQuery() {
	return queryOptions({
		queryFn: () => listTodos(),
		queryKey: ["todos"],
	});
}
