import { queryOptions } from "@raf-query/react";
import { Effect } from "effect";

import { DocsClient } from "./client.ts";

// Their error types are the RPC client's: each procedure's errors, the
// middleware's `Unauthorized` and the transport's `RpcClientError`.

export function docListQuery() {
	return queryOptions({
		queryFn: () => Effect.flatMap(DocsClient, (docs) => docs.ListDocs()),
		queryKey: ["docs"],
		retry: false,
	});
}

export function docQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.flatMap(DocsClient, (docs) => docs.GetDoc({ id: input.id })),
		queryKey: ["docs", input.id],
		retry: false,
	});
}
