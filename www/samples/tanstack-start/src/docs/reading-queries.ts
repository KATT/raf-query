import {
	type QueryHandle,
	type UseQueryOptions,
	useQuery,
} from "@raf-query/react";
import { use } from "react";
import { postQuery } from "~/queries.ts";

declare const factory: typeof postQuery;

declare const handle: QueryHandle<typeof postQuery>;

declare const options: UseQueryOptions | undefined;

// #region intro
const [postThenable, postState] = useQuery(factory, handle, options);
const post = use(postThenable);
// #endregion
