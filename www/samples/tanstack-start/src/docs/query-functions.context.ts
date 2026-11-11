import type { Post } from "~/api.ts";
import { posts } from "~/queries.ts";

interface ApiClient {
	getPost(slug: string, init: { signal: AbortSignal }): Promise<Post>;
}

// #region context
import {
	bindQueryOptions,
	createQueryClient,
	part,
	recommended,
} from "@raf-query/react";

interface Api {
	readonly context: { readonly api: ApiClient };
}

// On a server: called once per request, with an API client that sends the
// request's cookies.
export function makeQueryClient(apiClient: ApiClient) {
	return createQueryClient({
		parts: [...recommended(), part<Api>({ context: { api: apiClient } })],
	});
}

// In the app's `raf.ts`
const queryOptions = bindQueryOptions<typeof makeQueryClient>();

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: ({ api, signal }) => api.getPost(input.slug, { signal }),
	});
}
// #endregion
