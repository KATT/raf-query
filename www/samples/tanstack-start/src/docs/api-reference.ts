import { QueryClient, type QueryClientConfig } from "@raf-query/react";
import {
	type EnsuredQueryHandle,
	type QueryHandle,
	useQuery,
	type UseQueryOptions,
} from "@raf-query/react";
import { postQuery } from "~/queries.ts";

declare const config: QueryClientConfig | undefined;

// #region queryclient
const queryClient = new QueryClient(config);
// #endregion

declare const factory: typeof postQuery;

declare const handle: QueryHandle<typeof postQuery>;

declare const ensuredHandle: EnsuredQueryHandle<typeof postQuery>;

declare const options: UseQueryOptions | undefined;

// #region usequery
const [promise, controls] = useQuery(factory, handle, options);
const [data, ensuredControls] = useQuery(factory, ensuredHandle, options);
// #endregion
