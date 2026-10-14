import { QueryClient } from "@raf-query/react";

import { commentsQuery, postQuery } from "./queries";

const qc = new QueryClient();
declare const slug: string;

export async function loaderOrderExamples() {
	// #region order
	{
		// ❌ comments wait for the post
		const post = await qc.ensure(postQuery, { slug });
		const comments = qc.prefetch(commentsQuery, { slug });
		void post;
		void comments;
	}

	{
		// ✅ both start together
		const comments = qc.prefetch(commentsQuery, { slug });
		const post = await qc.ensure(postQuery, { slug });
		void post;
		void comments;
	}
	// #endregion
}
