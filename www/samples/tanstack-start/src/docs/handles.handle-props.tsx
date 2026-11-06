import { commentsQuery, postQuery } from "~/queries.ts";

// #region handle-props
import type { DefinedQueryHandle, QueryHandle } from "@raf-query/react";

// Fed by `prefetchEntry`: `useQuery` returns a promise.
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// ...
}

// Fed by `ensureEntry` or `fetchEntry`: `useQuery` returns the data.
function Post(props: { handle: DefinedQueryHandle<typeof postQuery> }) {
	// ...
}
// #endregion

export { Comments, Post };
