import { commentsQuery } from "~/queries.ts";

// #region handle-props
import type { QueryHandle } from "@raf-query/react";

// Takes a handle from `prefetch`, `ensure` or `fetch`.
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// ...
}
// #endregion
