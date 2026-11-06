import { getPost } from "~/api.ts";

// #region a-taste
import { queryOptions } from "@raf-query/react";
import { group } from "@raf-query/react/groups";

const posts = group("posts");

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts(input.slug),
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}
// #endregion
