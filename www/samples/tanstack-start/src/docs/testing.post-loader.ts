import { load, prefetch, type QueryClient, swr } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { commentsQuery, postQuery } from "~/queries.ts";

export async function postLoader(args: {
	context: { queryClient: QueryClient };
	params: { slug: string };
}) {
	const [handles] = await load(args.context.queryClient, {
		comments: prefetch(commentsQuery, { slug: args.params.slug }),
		post: swr(postQuery, { slug: args.params.slug }),
	});
	return handles;
}

export const Route = createFileRoute("/posts/$slug")({ loader: postLoader });
