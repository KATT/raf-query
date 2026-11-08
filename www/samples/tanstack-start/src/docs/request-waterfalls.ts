import { createQueryClient, load, prefetch, swr } from "@raf-query/react";
import { commentsQuery, postQuery } from "~/queries.ts";

const qc = createQueryClient();

declare const slug: string;

// #region start-every-query-before-awaiting-any
{
	// ❌ the comments wait for the post
	const [post] = await load(qc, { post: swr(postQuery, { slug }) });
	const [comments] = await load(qc, {
		comments: prefetch(commentsQuery, { slug }),
	});
}

{
	// ✅ both start together
	const [handles] = await load(qc, {
		comments: prefetch(commentsQuery, { slug }),
		post: swr(postQuery, { slug }),
	});
}
// #endregion
