/* oxlint-disable anti-slop/no-unknown-returns, perfectionist/sort-object-types -- sample queryFns and input fields follow the guide */
import { queryOptions } from "@raf-query/react";

import { getSpecial, getTodo, listTodos } from "./api";

// #region simple-keys
// A list of todos
queryOptions({ queryKey: ["todos"], queryFn: () => listTodos() });

// Something else, whatever!
queryOptions({
	queryKey: ["something", "special"],
	queryFn: () => getSpecial(),
});
// #endregion

// #region keys-with-variables
declare function queryFn(): Promise<unknown>;
// An individual todo
queryOptions({ queryKey: ["todo", 5], queryFn: () => getTodo(5) });

// An individual todo in a "preview" format
queryOptions({ queryKey: ["todo", 5, { preview: true }], queryFn });

// A list of todos that are "done"
queryOptions({ queryKey: ["todos", { status: "done" }], queryFn });
// #endregion

// #region todos-query
export function todosQuery(input: { status: "open" | "done"; page: number }) {
	return queryOptions({
		queryKey: ["todos", "list", input],
		queryFn: () => listTodos(input),
	});
}
// #endregion
