import {
	createQueryClient,
	infiniteQueryOptions,
	invalidateMany,
	queryOptions,
} from "@raf-query/react";
import { getTodo, listTodos } from "~/api.ts";

declare function getSpecial(): Promise<unknown>;

// #region simple-keys
// A list of todos
infiniteQueryOptions({
	queryKey: ["todos"],
	queryFn: async () => ({
		items: await listTodos(),
		nextCursor: null,
	}),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});

// Something else, whatever!
queryOptions({
	queryKey: ["something", "special"],
	queryFn: () => getSpecial(),
});
// #endregion

// #region groups
import { group } from "@raf-query/react/groups";

export const todos = group("todos");
export const archived = group("archived", todos);

todos;
// ^?
archived.group;
//       ^?
// #endregion

declare function queryFn(): Promise<unknown>;

// #region keys-with-variables
// An individual todo
queryOptions({ queryKey: [todos, "byId", 5], queryFn: () => getTodo(5) });

// An individual todo in a "preview" format
queryOptions({ queryKey: [todos, "byId", 5, { preview: true }], queryFn });

// A list of archived todos that are "done"
infiniteQueryOptions({
	queryKey: [archived, "list", { status: "done" }],
	queryFn: async () => ({
		items: await queryFn(),
		nextCursor: null,
	}),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});
// #endregion

declare const status: string;

declare const page: number;

// #region keys-are-hashed-deterministically
[todos, { status, page }];
[todos, { page, status }];
[todos, { page, status, other: undefined }];
// #endregion

// #region array-order-matters
[todos, status, page];
[todos, page, status];
[todos, undefined, page, status];
// #endregion

// #region put-the-input-in-the-key
export function todoListQuery(input: {
	status: "open" | "done";
	page: number;
}) {
	return queryOptions({
		queryKey: [todos, "list", input],
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
