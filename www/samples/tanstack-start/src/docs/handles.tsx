import { useQuery } from "@raf-query/react";
import { use } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";
import { Route } from "~/routes/posts.$slug.tsx";

// #region reading
const loaderData = Route.useLoaderData();
const [postPromise] = useQuery(postQuery, loaderData.post); // ensured: fulfilled
const post = use(postPromise); // doesn't suspend
const [commentsPromise] = useQuery(commentsQuery, loaderData.comments); // prefetched
// #endregion
