import { group, load, prefetch } from "@raf-query/react";
import { queryOptions } from "~/raf.ts";
import { makeQueryClient } from "~/query-client.ts";

import { getPost } from "~/api.ts";

const posts = group("posts");

const qc = makeQueryClient();

// #region two-parameters
function postPageQuery(slug: string, page: number) {
	return queryOptions({
		queryKey: posts(slug, page),
		queryFn: () => getPost(slug),
	});
}

await load(qc, {
	// @ts-expect-error -- 2345: a factory takes one input
	post: prefetch(postPageQuery, "hello-world"),
});
// #endregion
