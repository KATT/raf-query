import { group, queryOptions } from "@raf-query/react";
import { todos } from "~/queries.ts";

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

declare const input: { id: number };

// #region using-axios-or-other-clients
queryOptions({
	queryKey: todos("byId", input.id),
	queryFn: (context) =>
		axios.get(`/api/todos/${input.id}`, { signal: context.signal }),
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
	queryKey: todos("byId", input.id),
	queryFn: (context) => {
		const request = client.get(`/todos/${input.id}`);
		context.signal.addEventListener("abort", () => request.cancel());
		return request.promise;
	},
});
// #endregion
