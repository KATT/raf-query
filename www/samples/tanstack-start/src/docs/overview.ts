import { getPost } from "~/api.ts";

// #region a-taste
import { group } from "@raf-query/react";

import { queryOptions } from "~/raf.ts";

const posts = group("posts");

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts(input.slug),
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}
// #endregion
