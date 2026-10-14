/* oxlint-disable no-unused-expressions, typescript/no-deprecated -- example query keys; `status` is a field name */
import type { QueryKey } from "@raf-query/react";
import { Query as QueryModule } from "@raf-query/react";

export type Query = QueryModule.Query;

// #region filter-interface
export interface Filter {
	exact?: boolean; // match `queryKey` exactly instead of as a prefix
	predicate?: (query: Query) => boolean; // runs after key matching
	queryKey?: QueryKey; // key prefix; every key matches without it
}
// #endregion

// #region example-keys
["todos"];
["todos", { status: "done" }];
["todos", { status: "done", page: 2 }];
["todos", 5];
["users"];
// #endregion
