import { QueryClient } from "@raf-query/react";

import { authorQuery, postQuery } from "./queries";

const qc = new QueryClient();
declare const slug: string;

export async function loadPostWithAuthor() {
	// #region server
	const post = await qc.fetch(postQuery, { slug });
	const author = qc.prefetch(authorQuery, { id: post.authorId });
	// #endregion
	return { author, post };
}
