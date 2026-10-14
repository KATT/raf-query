import { allKeyed, QueryClient, queryOptions } from "@raf-query/react";

import { getAuthor } from "./api";
import { postQuery } from "./queries";

const qc = new QueryClient();
declare const slug: string;

function authorQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => getAuthor(input.slug),
		queryKey: ["author", input.slug],
	});
}

export async function loadPostAndAuthor() {
	// #region all-keyed
	return await allKeyed({
		author: qc.ensure(authorQuery, { slug }),
		post: qc.ensure(postQuery, { slug }),
	});
	// #endregion
}
