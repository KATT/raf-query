import { queryOptions } from "@raf-query/react";

import { getPost, listTodos } from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

export function todosQuery() {
	return queryOptions({
		queryKey: ["todos"],
		queryFn: () => listTodos(),
	});
}
