import { QueryClient, queryOptions } from "@raf-query/react";

import { postQuery } from "./queries";

const qc = new QueryClient();

function issuesQuery() {
	return queryOptions({ queryKey: ["issues"], queryFn: async () => [] });
}

// #region prefetch
qc.prefetch(postQuery, { slug: "hello-world" });
qc.prefetch(issuesQuery); // a factory without input
// #endregion

export { issuesQuery, qc };
