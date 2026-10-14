/* oxlint-disable anti-slop/no-runtime-typeof -- sample predicate matches on handle input shape */
import { Query, QueryClient } from "@raf-query/react";

const qc = new QueryClient();

// #region predicate-invalidate
await qc.invalidate({
	predicate: (query) =>
		query.key[0] === "todos" &&
		typeof (query.handle.input as { page?: unknown } | undefined)?.page ===
			"number" &&
		(query.handle.input as { page: number }).page >= 2,
});

qc.remove({ predicate: (query) => Query.observerCountUnsafe(query) === 0 });
// #endregion
