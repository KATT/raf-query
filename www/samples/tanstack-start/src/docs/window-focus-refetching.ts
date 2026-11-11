import {
	createQueryClient,
	focusRefetch,
	polling,
	recommended,
	reconnectRefetch,
	retry,
} from "@raf-query/react";
import { getPost } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region the-features
const queryClient = createQueryClient({
	parts: [focusRefetch(), reconnectRefetch()],
});
// or
const withEverything = createQueryClient({ parts: recommended() });
// #endregion

// #region turning-it-off
// `recommended()` without focusRefetch() and reconnectRefetch()
const withoutFocus = createQueryClient({ parts: [retry(), polling()] });
// #endregion

// #region per-query
import { queryOptions } from "~/raf.ts";

// A post's body rarely changes while someone reads it.
export function postBodyQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("body", input.slug),
		queryFn: () => getPost(input.slug),
		refetchOnWindowFocus: false,
	});
}
// #endregion
