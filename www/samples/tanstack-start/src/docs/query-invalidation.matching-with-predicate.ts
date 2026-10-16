import { Query, QueryClient } from "@raf-query/react";

const qc = new QueryClient();

// #region matching-by-state
// Invalidate todos, skipping any with a request already in flight
await qc.invalidate({ fetchStatus: "idle", queryKey: ["todos"] });

// Drop what nothing reads, unless it's still fresh
qc.remove({ stale: true, type: "inactive" });

// Requests in flight for queries on screen
const fetching = qc.isFetching({ type: "active" });
// #endregion

// #region matching-with-predicate
// Every todo list on page 2 or later
await qc.invalidate({
	predicate: (query) =>
		query.key[0] === "todos" &&
		typeof (query.handle.input as { page?: unknown } | undefined)?.page ===
			"number" &&
		(query.handle.input as { page: number }).page >= 2,
});

// Every query whose last request failed
await qc.reset({
	predicate: (query) => Query.getUnsafe(query).status === "error",
});
// #endregion
