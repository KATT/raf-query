import { getPost, getPostViews } from "~/api.ts";
import { posts } from "~/queries.ts";

// #region clients
import {
	bindQueryOptions,
	createQueryClient,
	polling,
	type Retry,
	retry,
} from "@raf-query/react";

// The site retries and polls; the embeddable widget only retries.
export const makeSiteClient = () =>
	createQueryClient({ parts: [retry(), polling()] });
export const makeWidgetClient = () => createQueryClient({ parts: [retry()] });

// Bound to the site's client: its factories need `retry()` and `polling()`.
const siteQueryOptions = bindQueryOptions<typeof makeSiteClient>();
// Bound to the part both clients have: its factories run on either.
const sharedQueryOptions = bindQueryOptions<Retry>();

export function postViewsQuery(input: { slug: string }) {
	return siteQueryOptions({
		queryKey: posts("views", input.slug),
		queryFn: () => getPostViews(input.slug),
		refetchInterval: 2000,
	});
}

export function postQuery(input: { slug: string }) {
	return sharedQueryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
		retry: 1,
	});
}
// #endregion

// #region running
import { invalidateMany } from "@raf-query/react";

const site = makeSiteClient();
const widget = makeWidgetClient();

await invalidateMany(site, postQuery);
await invalidateMany(widget, postQuery);
await invalidateMany(site, postViewsQuery);
// @ts-expect-error -- 2769: the widget's client has no `polling()`
await invalidateMany(widget, postViewsQuery);
// #endregion

// #region defaults
import { recommended } from "@raf-query/react";

export function makeQueryClient() {
	return createQueryClient({
		parts: recommended(),
		defaults: {
			// The core's options
			staleTime: 30_000,
			gcTime: 10 * 60_000,
			// Options of `retry()` and `focusRefetch()`
			retry: 1,
			refetchOnWindowFocus: false,
		},
	});
}
// #endregion

// #region defaults-errors
createQueryClient({
	parts: [polling()],
	// @ts-expect-error -- 2353: no part of this client declares `retry`
	defaults: { retry: 1 },
});
// #endregion
