import {
	fetchNextPage,
	getData,
	hasNextPage,
	load,
	swr,
} from "@raf-query/react";
import { commentsQuery } from "~/queries.ts";
import type { makeQueryClient } from "~/query-client.ts";

declare const queryClient: ReturnType<typeof makeQueryClient>;

declare const slug: string;

// #region outside-react
await load(queryClient, { comments: swr(commentsQuery, { slug }) });
if (hasNextPage(queryClient, commentsQuery, { slug })) {
	await fetchNextPage(queryClient, commentsQuery, { slug });
}

const comments = getData(queryClient, commentsQuery, { slug });
comments?.pages.length;
//        ^?
// #endregion
