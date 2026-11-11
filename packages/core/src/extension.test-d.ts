/**
 * A third-party part, written with the public exports only: everything
 * below imports from `./index.ts`, the published entry.
 */
import { describe, expectTypeOf, it } from "vitest";

import {
	bindQueryOptions,
	createQueryClient,
	group,
	invalidateMany,
	type Operation,
	type Optional,
	type Part,
	part,
	type QueryClient,
	type QueryInfo,
	type Retry,
	retry,
	type RootOf,
	setData,
	type Target,
} from "./index.ts";

/** What `traced()` declares: the option its link reads. */
interface Traced {
	readonly options: { readonly traceId?: string };
}

function label(op: Operation<Traced>): string {
	return op.options.traceId ?? op.hash;
}

/** Logs every request, tagged with the query's `traceId`. */
function traced(log: (line: string) => void): Part<Traced> {
	return part<Traced>({
		link: async (op, next) => {
			log(`start ${label(op)}`);
			try {
				return await next(op);
			} finally {
				log(`end ${label(op)}`);
			}
		},
	});
}

/** What `ownership()` declares: an option for `ownedBy` to match on. */
interface Ownership {
	readonly options: { readonly owner?: "billing" | "growth" };
}

/** Counts cache events, and declares `owner`. */
function ownership(onEvent: (type: string) => void): Part<Ownership> {
	return part<Ownership>({
		setup: (client, signal) => {
			client.subscribe((event) => onEvent(event.type), { signal });
		},
	});
}

/** A target over the option the part declares. */
const ownedBy: Target<Ownership["options"], Ownership["options"]["owner"]> = {
	where: (query: QueryInfo<Ownership["options"]>, owner) =>
		query.options.owner === owner,
};

/** What `reports()` declares: a client for every `queryFn`. */
interface Reports {
	readonly context: {
		readonly reports: { get(id: number): Promise<{ readonly id: number }> };
	};
}

/** Gives every `queryFn` the request's reports client. */
function reports(baseUrl: string): Part<Reports> {
	return part<Reports>({
		context: {
			reports: { get: async (id) => ({ id: id + baseUrl.length }) },
		},
	});
}

/** The package's own factories: they need `reports()`, and set `retry` where the client retries. */
const packageQueryOptions = bindQueryOptions<Reports & Optional<Retry>>();
const reportKeys = group("reports");
const packageReportQuery = (input: { readonly id: number }) =>
	packageQueryOptions({
		queryFn: (context) => context.reports.get(input.id),
		queryKey: reportKeys("package", input.id),
		retry: false,
	});

/** What the package does with a client: any that has `reports()`. */
function seedReport(client: QueryClient<RootOf<Reports>>, id: number) {
	setData(client, packageReportQuery, { id }, { id });
}

const makeQueryClient = () =>
	createQueryClient({
		parts: [traced(() => {}), ownership(() => {}), reports("/api")],
	});

const queryOptions = bindQueryOptions<typeof makeQueryClient>();

describe("extensions with public exports only", () => {
	it("type a root's options and context by what its parts declare", () => {
		const reportQuery = (input: { readonly id: number }) =>
			queryOptions({
				owner: "billing",
				queryFn: (context) => context.reports.get(input.id),
				queryKey: reportKeys(input.id),
				traceId: "r",
			});
		expectTypeOf(reportQuery).returns.not.toBeAny();

		queryOptions({
			// @ts-expect-error -- `owner` takes the part's values only
			owner: "sales",
			queryFn: () => 1,
			queryKey: reportKeys("bad-owner"),
		});
		queryOptions({
			// @ts-expect-error -- no part declares `priority`
			priority: 1,
			queryFn: () => 1,
			queryKey: reportKeys("bad-key"),
		});
	});

	it("run a package's factories on the clients that have its part", () => {
		expectTypeOf(
			invalidateMany(makeQueryClient(), packageReportQuery),
		).resolves.toBeVoid();
		seedReport(makeQueryClient(), 1);
		const retrying = createQueryClient({ parts: [retry()] });
		// @ts-expect-error -- this client has no `reports()`
		void invalidateMany(retrying, packageReportQuery);
		// @ts-expect-error -- nor for the package's own functions
		seedReport(retrying, 1);
	});

	it("invalidate with a third-party target", () => {
		const client: QueryClient = makeQueryClient();
		expectTypeOf(invalidateMany(client, ownedBy, "growth")).resolves.toBeVoid();
		expectTypeOf(
			invalidateMany(client, [reportKeys, [ownedBy, "billing"]]),
		).resolves.toBeVoid();
		// @ts-expect-error -- the target's parameter is an owner
		void invalidateMany(client, ownedBy, "sales");
	});
});
