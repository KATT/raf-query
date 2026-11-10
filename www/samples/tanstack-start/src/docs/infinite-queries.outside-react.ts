import {
	fetchNextPage,
	getData,
	load,
	type QueryClient,
	swr,
} from "@raf-query/react";
import { commentsQuery } from "~/queries.ts";

declare const queryClient: QueryClient;

declare const slug: string;

// #region outside-react
await load(queryClient, { comments: swr(commentsQuery, { slug }) });
await fetchNextPage(queryClient, commentsQuery, { slug });

const comments = getData(queryClient, commentsQuery, { slug });
comments?.pages.length;
//        ^?
// #endregion
