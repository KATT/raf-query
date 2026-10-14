import axios from "axios";
import { queryOptions } from "@raf-query/react";

import { searchPosts } from "./api";

declare const todoInput: { id: number };

// #region search-query
export function searchQuery(input: { q: string }) {
	return queryOptions({
		queryKey: ["search", input.q],
		queryFn: (context) => searchPosts({ q: input.q, signal: context.signal }),
	});
}
// #endregion

// #region axios
queryOptions({
	queryKey: ["todos", todoInput.id],
	queryFn: (context) =>
		axios.get(`/api/todos/${todoInput.id}`, { signal: context.signal }),
});
// #endregion

// #region cancel-callback
declare const client: {
	get(url: string): {
		cancel(): void;
		promise: Promise<unknown>;
	};
};

queryOptions({
	queryKey: ["todos", todoInput.id],
	queryFn: (context) => {
		const request = client.get(`/todos/${todoInput.id}`);
		context.signal.addEventListener("abort", () => request.cancel());
		return request.promise;
	},
});
// #endregion
