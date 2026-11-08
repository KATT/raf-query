import {
	createQueryClient,
	group,
	invalidateMany,
	queryOptions,
} from "@raf-query/react";
import { getTodo, listTodos } from "~/api.ts";

declare function getSpecial(): Promise<unknown>;

// #region groups
export const todos = group("todos");
export const archived = group(todos, "archived");

const key = archived("list");
//    ^?
archived.path;
//       ^?
// #endregion

// #region simple-keys
const settings = group("settings");

// A list of todos
queryOptions({ queryKey: todos("list"), queryFn: () => listTodos() });

// Something else, whatever!
queryOptions({
	queryKey: settings(),
	queryFn: () => getSpecial(),
});
// #endregion

declare function queryFn(): Promise<unknown>;

// #region keys-with-variables
// An individual todo
queryOptions({ queryKey: todos("byId", 5), queryFn: () => getTodo(5) });

// An individual todo in a "preview" format
queryOptions({ queryKey: todos("byId", 5, { preview: true }), queryFn });

// A list of archived todos that are "done"
queryOptions({ queryKey: archived("list", { status: "done" }), queryFn });
// #endregion

declare const status: string;

declare const page: number;

// #region keys-are-hashed-deterministically
todos("list", { status, page });
todos("list", { page, status });
todos("list", { page, status, other: undefined });
// #endregion

// #region array-order-matters
todos("list", status, page);
todos("list", page, status);
todos("list", undefined, page, status);
// #endregion

// #region put-the-input-in-the-key
export function todoListQuery(input: {
	status: "open" | "done";
	page: number;
}) {
	return queryOptions({
		queryKey: todos("list", input),
		queryFn: () => listTodos(input),
	});
}
// #endregion

const qc = createQueryClient();

// #region design-keys-for-invalidation
await invalidateMany(qc, todos); // every todo query, archived ones too
await invalidateMany(qc, archived); // only archived ones
await invalidateMany(qc, todoListQuery); // every page of every list
await invalidateMany(qc, todoListQuery, { status: "open" }); // the open lists
// #endregion

// #region hand-written-keys
export function todoQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["todos", "byId", input.id],
		queryFn: () => getTodo(input.id),
	});
}

await invalidateMany(qc, todos); // covers it: its key starts with ["todos"]
// #endregion
