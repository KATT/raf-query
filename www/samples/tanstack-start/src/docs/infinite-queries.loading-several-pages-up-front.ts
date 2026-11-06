import { ensureEntry, load, type QueryClient } from "@raf-query/react";
import { commentsQuery } from "~/queries.ts";

declare const queryClient: QueryClient;

declare const slug: string;

// #region loading-several-pages-up-front
const [handles] = await load(queryClient, {
	comments: ensureEntry(commentsQuery, { slug }, { pages: 2 }),
});
// #endregion
