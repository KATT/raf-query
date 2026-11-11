import { load, swr } from "@raf-query/react";
import { commentsQuery } from "~/queries.ts";
import type { makeQueryClient } from "~/query-client.ts";

declare const queryClient: ReturnType<typeof makeQueryClient>;

declare const slug: string;

// #region loading-several-pages-up-front
const [handles] = await load(queryClient, {
	comments: swr(commentsQuery, { slug }, { pages: 2 }),
});
// #endregion
