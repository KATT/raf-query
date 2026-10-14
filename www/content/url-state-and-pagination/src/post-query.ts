import { queryOptions } from "@raf-query/react";

import type { Post } from "./api";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: async (): Promise<Post> => ({
			body: "",
			slug: input.slug,
			title: "",
		}),
	});
}
