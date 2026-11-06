import { listTodos } from "~/api.ts";
import { group } from "@raf-query/react/groups";

declare function listInvoices(input: { orgId: string }): Promise<unknown>;

declare const toast: { error(message: string): void };

const settings = group("settings");
const invoices = group("invoices");

// #region intro
import { queryOptions } from "@raf-query/react";

export function settingsQuery() {
	return queryOptions({
		queryKey: settings(),
		queryFn: () => listTodos(),
		// Read by `retry()` and `focusRefetch()`, which `recommended()` includes.
		meta: { retry: 1, refetchOnWindowFocus: false },
	});
}
// #endregion

// #region root
import {
	createQueryClient,
	feature,
	link,
	recommended,
} from "@raf-query/react";

// A link that reads `meta.errorMessage`: one toast per failed request.
const errorToasts = link<{ meta: { errorMessage?: string } }>(
	async (op, next) => {
		try {
			return await next(op);
		} catch (error) {
			toast.error(op.meta.errorMessage ?? "Something went wrong");
			throw error;
		}
	},
);

// A feature with no behavior: it only declares a field, for targets to match on.
const ownership = feature<{ meta: { owner?: "billing" | "growth" } }>();

export function makeQueryClient() {
	const { features, links } = recommended();
	return createQueryClient({
		links: [errorToasts, ...links],
		features: [...features, ownership],
	});
}
// #endregion

// #region def
import { defType } from "@raf-query/react";

export function invoicesQuery(input: { orgId: string }) {
	return queryOptions({
		def: defType<typeof makeQueryClient>(),
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

// #region def-errors
queryOptions({
	def: defType<typeof makeQueryClient>(),
	queryKey: invoices("all"),
	queryFn: () => listInvoices({ orgId: "all" }),
	// @ts-expect-error -- 2769: no link or feature of the root reads `cacheFor`
	meta: { cacheFor: 60_000 },
});
// #endregion

// #region selecting-queries-by-meta
import { invalidateMany } from "@raf-query/react";

const qc = makeQueryClient();

await invalidateMany(qc, {
	where: (query) => query.meta.owner === "billing",
	//                         ^?
});
// #endregion
