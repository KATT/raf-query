import {
	createQueryClient,
	ensureEntry,
	load,
	prefetchEntry,
} from "@raf-query/react";
import { commentsQuery, postQuery } from "~/queries.ts";

const qc = createQueryClient();

declare const slug: string;

// #region start-every-query-before-awaiting-any
{
	// ❌ the comments wait for the post
	const [post] = await load(qc, { post: ensureEntry(postQuery, { slug }) });
	const [comments] = await load(qc, {
		comments: prefetchEntry(commentsQuery, { slug }),
	});
}

{
	// ✅ both start together
	const [handles] = await load(qc, {
		comments: prefetchEntry(commentsQuery, { slug }),
		post: ensureEntry(postQuery, { slug }),
	});
}
// #endregion
