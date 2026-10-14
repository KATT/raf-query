import { Query, QueryClient } from "@raf-query/react";

import "./register";

const qc = new QueryClient();

export async function invalidateBilling() {
	// #region invalidate
	await qc.invalidate({
		predicate: (query) => Query.metaUnsafe(query)?.scope === "billing",
	});
	// #endregion
}
