import { commentsQuery } from "~/queries.ts";

// #region handle-props
import type { EnsuredQueryHandle, QueryHandle } from "@raf-query/react";

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// ...
}
// #endregion
