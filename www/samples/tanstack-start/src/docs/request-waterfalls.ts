import { load, prefetch, swr } from "@raf-query/react";
import { commentsQuery, postQuery } from "~/queries.ts";
import { makeQueryClient } from "~/query-client.ts";

const qc = makeQueryClient();

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
