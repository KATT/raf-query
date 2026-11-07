import { useQuery } from "@raf-query/react";
import { use } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";
import { Route } from "~/routes/posts.$slug.tsx";

// #region reading-a-handle
const loaderData = Route.useLoaderData();
const [postThenable] = useQuery(postQuery, loaderData.post); // ensureEntry
const post = use(postThenable); // fulfilled: returns at once
//    ^?
const [commentsThenable] = useQuery(commentsQuery, loaderData.comments); // prefetchEntry
const comments = use(commentsThenable); // suspends until the comments land
// #endregion
