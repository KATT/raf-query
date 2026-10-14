import { queryOptions } from "@raf-query/react";

import { fetchAllTodos, fetchTodoById } from "./api";

const id = 1;

// #region valid
queryOptions({ queryKey: ["todos"], queryFn: fetchAllTodos });
queryOptions({ queryKey: ["todos", id], queryFn: () => fetchTodoById(id) });
queryOptions({
	queryKey: ["todos", id],
	queryFn: async () => {
		const data = await fetchTodoById(id);
		return data;
	},
});
queryOptions({
	queryKey: ["todos", id],
	queryFn: (context) => fetchTodoById(context.queryKey[1] as number),
});
// #endregion

const somethingGoesWrong = false;
const somethingElseGoesWrong = false;
const data: unknown = undefined;

// #region errors
queryOptions({
	queryKey: ["todos", id],
	queryFn: async () => {
		if (somethingGoesWrong) {
			throw new Error("Oh no!");
		}
		if (somethingElseGoesWrong) {
			// oxlint-disable-next-line unicorn/no-useless-promise-resolve-reject -- docs show rejected promises explicitly
			return Promise.reject(new Error("Oh no!"));
		}
		return data;
	},
});
// #endregion

// #region fetch
queryOptions({
	queryKey: ["todos", id],
	queryFn: async (context) => {
		const response = await fetch(`/todos/${id}`, { signal: context.signal });
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status}`);
		}
		return response.json();
	},
});
// #endregion
