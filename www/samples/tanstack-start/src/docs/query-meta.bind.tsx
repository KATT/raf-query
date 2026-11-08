import { group } from "@raf-query/react";

import type { makeQueryClient } from "./query-meta.ts";

declare function listInvoices(input: { orgId: string }): Promise<unknown>;

const invoices = group("invoices");

// #region bind
import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	bindUseQueryClient,
} from "@raf-query/react";

// `makeQueryClient` is the function above, imported with `import type`.
type Client = typeof makeQueryClient;

export const queryOptions = bindQueryOptions<Client>();
export const useQueryClient = bindUseQueryClient<Client>();
// Only in an app that pages:
export const infiniteQueryOptions = bindInfiniteQueryOptions<Client>();
// #endregion

// #region bound
export function invoicesQuery(input: { orgId: string }) {
	return queryOptions({
		queryKey: invoices(input),
		queryFn: () => listInvoices(input),
		meta: {
			errorMessage: "Couldn't load invoices",
			owner: "billing",
			retry: 1,
		},
	});
}
// #endregion

// #region bound-errors
queryOptions({
	queryKey: invoices("all"),
	queryFn: () => listInvoices({ orgId: "all" }),
	// @ts-expect-error -- 2769: no link or feature of the root reads `cacheFor`
	meta: { cacheFor: 60_000 },
});
// #endregion

// #region use-query-client
import { invalidateMany } from "@raf-query/react";

export function RefreshInvoices(props: { orgId: string }) {
	const client = useQueryClient();
	return (
		<button
			onClick={() => invalidateMany(client, invoicesQuery, props)}
			type="button"
		>
			Refresh
		</button>
	);
}
// #endregion
