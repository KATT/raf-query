import {
	createQueryClient,
	type DefinedQueryHandle,
	ensureEntry,
	load,
	prefetchEntry,
	type QueryClientConfig,
	type QueryHandle,
	useQuery,
	type UseQueryOptions,
} from "@raf-query/react";
import { commentsQuery, postQuery } from "~/queries.ts";

declare const config: QueryClientConfig | undefined;

// #region createqueryclient
const queryClient = createQueryClient(config);
// #endregion

declare const slug: string;

// #region load
const [handles, data] = await load(queryClient, {
	comments: prefetchEntry(commentsQuery, { slug }),
	post: ensureEntry(postQuery, { slug }),
});
// #endregion

declare const factory: typeof postQuery;

declare const handle: QueryHandle<typeof postQuery>;

declare const definedHandle: DefinedQueryHandle<typeof postQuery>;

declare const options: UseQueryOptions | undefined;

// #region usequery
const [promise, controls] = useQuery(factory, handle, options);
const [post, postControls] = useQuery(factory, definedHandle, options);
// #endregion
