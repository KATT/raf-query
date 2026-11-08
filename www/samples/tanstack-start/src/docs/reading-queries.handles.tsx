import { type QueryHandle, useQuery, useInfiniteQuery } from "@raf-query/react";
import { use } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";
// What `load` resolved with: `post` from `swr`, `comments` from `prefetch`.
declare const handles: {
	post: QueryHandle<typeof postQuery>;
	comments: QueryHandle<typeof commentsQuery>;
};

// #region reading-a-handle
const [postThenable] = useQuery(postQuery, handles.post); // swr
const post = use(postThenable); // fulfilled: returns at once
//    ^?
const [commentsThenable] = useInfiniteQuery(commentsQuery, handles.comments); // prefetch
const comments = use(commentsThenable); // suspends until the comments land
// #endregion
