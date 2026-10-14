import { queryOptions } from "@raf-query/react";

import { getPost } from "./api";

// #region retry
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		retry: 5, // or false, true, a predicate, or a Schedule
	});
}
// #endregion
