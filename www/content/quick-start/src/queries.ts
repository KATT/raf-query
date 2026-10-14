import { queryOptions } from "@raf-query/react";

import { fetchTodo } from "./api";

export function todosQuery() {
	return queryOptions({
		queryKey: ["todos"],
		queryFn: async () => {
			const response = await fetch("/api/todos");
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return (await response.json()) as Array<{ id: number; title: string }>;
		},
	});
}

export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["todos", input.id],
		queryFn: () => fetchTodo(input.id),
		staleTime: 30_000,
	});
}
