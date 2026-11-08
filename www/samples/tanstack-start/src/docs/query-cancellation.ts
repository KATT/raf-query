import { group, queryOptions } from "@raf-query/react";
import { posts } from "~/queries.ts";

interface SearchResult {
	readonly id: string;
	readonly title: string;
}

// #region intro
export const search = group("search");

export function searchQuery(input: { q: string }) {
	return queryOptions({
		queryKey: search(input.q),
		queryFn: async (context) => {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(input.q)}`,
				{ signal: context.signal },
			);
			return (await response.json()) as ReadonlyArray<SearchResult>;
		},
	});
}
// #endregion

declare const axios: {
	get(url: string, options: { signal: AbortSignal }): Promise<unknown>;
};

declare const input: { slug: string };

// #region using-axios-or-other-clients
queryOptions({
	queryKey: posts("bySlug", input.slug),
	queryFn: (context) =>
		axios.get(`/api/posts/${input.slug}`, { signal: context.signal }),
});
// #endregion

declare const client: {
	get(url: string): {
		cancel(): void;
		promise: Promise<unknown>;
	};
};

// #region abort-listener
queryOptions({
	queryKey: posts("bySlug", input.slug),
	queryFn: (context) => {
		const request = client.get(`/api/posts/${input.slug}`);
		context.signal.addEventListener("abort", () => request.cancel());
		return request.promise;
	},
});
// #endregion
