import {
	type EnsuredQueryHandle,
	type QueryHandle,
	type UseQueryOptions,
	useQuery,
} from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const factory: typeof postQuery;

declare const handle: QueryHandle<typeof postQuery>;

declare const ensuredHandle: EnsuredQueryHandle<typeof postQuery>;

declare const options: UseQueryOptions | undefined;

// #region intro
{
	const [promise, controls] = useQuery(factory, handle, options);
}
{
	const [data, controls] = useQuery(factory, ensuredHandle, options);
}
// #endregion
