import {
	createQueryClient,
	focusRefetch,
	polling,
	queryOptions,
	recommended,
	reconnectRefetch,
	retry,
} from "@raf-query/react";
import { getPost } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region the-features
const queryClient = createQueryClient({
	features: [focusRefetch(), reconnectRefetch()],
});
// or
const withEverything = createQueryClient({ ...recommended() });
// #endregion

// #region turning-it-off
// `recommended()` without focusRefetch() and reconnectRefetch()
const withoutFocus = createQueryClient({
	links: [retry()],
	features: [polling()],
});
// #endregion

// #region per-query
// A post's body rarely changes while someone reads it.
export function postBodyQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("body", input.slug),
		queryFn: () => getPost(input.slug),
		meta: { refetchOnWindowFocus: false },
	});
}
// #endregion
