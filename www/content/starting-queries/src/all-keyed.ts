import { allKeyed, type QueryClient } from "@raf-query/react";

import { authorQuery, postQuery } from "./queries";

declare const qc: QueryClient;
declare const slug: string;

export async function loadPostAndAuthor() {
	// #region all-keyed
	return await allKeyed({
		post: qc.ensure(postQuery, { slug }),
		author: qc.ensure(authorQuery, { id: slug }),
	});
	// #endregion
}
