import { load, prefetch } from "@raf-query/react";
import { queryOptions } from "~/raf.ts";
import { createFileRoute } from "@tanstack/react-router";

import { getPostAuthor } from "~/api.ts";
import { authors, postQuery } from "~/queries.ts";

// #region author-backend
export function postAuthorQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: authors("byPost", input.slug),
		queryFn: () => getPostAuthor(input.slug),
	});
}

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const { slug } = args.params;
		const [handles] = await load(args.context.queryClient, {
			author: prefetch(postAuthorQuery, { slug }),
			post: prefetch(postQuery, { slug }),
		});
		return handles;
	},
});
// #endregion
