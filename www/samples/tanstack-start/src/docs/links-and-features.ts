import { group } from "@raf-query/react";
import { type CommentPage, listPosts, type Post } from "~/api.ts";

declare const toast: { error(message: string): void };

/** The app's API client: on a server, one per request, with its cookies. */
export interface ApiClient {
	getPost(slug: string, init: { signal: AbortSignal }): Promise<Post>;
	listComments(
		input: { cursor: number; slug: string },
		init: { signal: AbortSignal },
	): Promise<CommentPage>;
}

const posts = group("posts");

// #region intro
import { queryOptions } from "~/raf.ts";

export function postsQuery(input: { page: number; sort: "newest" | "oldest" }) {
	return queryOptions({
		queryKey: posts("list", input),
		queryFn: () => listPosts(input),
		// Options of `retry()` and `focusRefetch()`, which `recommended()` includes.
		retry: 1,
		refetchOnWindowFocus: false,
	});
}
// #endregion

// #region link
import { part } from "@raf-query/react";

interface ErrorToasts {
	readonly options: { readonly errorMessage?: string };
}

// One toast per failed request, with the query's own message.
const errorToasts = part<ErrorToasts>({
	link: async (op, next) => {
		try {
			return await next(op);
		} catch (error) {
			toast.error(op.options.errorMessage ?? "Something went wrong");
			throw error;
		}
	},
});
// #endregion

// #region feature
import { invalidateAll } from "@raf-query/react";

// Refetches what's on screen when the server says something changed.
const liveUpdates = part({
	setup: (client, signal) => {
		const events = new EventSource("/api/events");
		events.addEventListener("message", () => void invalidateAll(client));
		signal.addEventListener("abort", () => events.close());
	},
});
// #endregion

// #region context
interface Api {
	readonly context: { readonly api: ApiClient };
}

// A function, so each client is given its own API client.
const api = (apiClient: ApiClient) =>
	part<Api>({ context: { api: apiClient } });
// #endregion

// #region declaration
export interface Ownership {
	readonly options: { readonly owner?: "editorial" | "community" };
}

// No link, setup or context: it only declares `owner`.
const ownership = part<Ownership>();
// #endregion

// #region root
import { createQueryClient, recommended } from "@raf-query/react";

export function makeQueryClient(apiClient: ApiClient) {
	return createQueryClient({
		parts: [
			errorToasts,
			...recommended(),
			liveUpdates,
			api(apiClient),
			ownership,
		],
	});
}
// #endregion
