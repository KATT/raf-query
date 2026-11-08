import { load, prefetch, revalidate } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { authorQuery, postQuery } from "~/queries.ts";

// #region author-waterfall
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		const [postHandles, data] = await load(qc, {
			post: revalidate(postQuery, { slug }),
		});
		const [authorHandles] = await load(qc, {
			author: prefetch(authorQuery, { id: data.post.authorId }),
		});
		return { ...postHandles, ...authorHandles };
	},
});
// #endregion
