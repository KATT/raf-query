import {
	createQueryClient,
	load,
	prefetch,
	type QueryHandle,
	recommended,
	swr,
	useQuery,
	type UseQueryOptions,
} from "@raf-query/react";
import { use } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";

// #region createqueryclient
const queryClient = createQueryClient({
	plugins: recommended(),
	defaults: { staleTime: 30_000 },
});
// #endregion

declare const slug: string;

// #region load
const [handles, data] = await load(queryClient, {
	comments: prefetch(commentsQuery, { slug }),
	post: swr(postQuery, { slug }),
});
// #endregion

declare const factory: typeof postQuery;

declare const handle: QueryHandle<typeof postQuery>;

declare const options: UseQueryOptions | undefined;

// #region usequery
const [postThenable, postState] = useQuery(factory, handle, options);
const post = use(postThenable);
// #endregion
