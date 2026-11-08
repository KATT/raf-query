import {
	createQueryClient,
	group,
	load,
	prefetchEntry,
	queryOptions,
} from "@raf-query/react";

import { getPost } from "~/api.ts";

const posts = group("posts");

const qc = createQueryClient();

// #region two-parameters
function postPageQuery(slug: string, page: number) {
	return queryOptions({
		queryKey: posts(slug, page),
		queryFn: () => getPost(slug),
	});
}

await load(qc, {
	// @ts-expect-error -- 2345: a factory takes one input
	post: prefetchEntry(postPageQuery, "hello-world"),
});
// #endregion
