/**
 * A third-party link and feature, written with the public exports only:
 * everything below imports from `./index.ts`, the published entry.
 */
import { describe, expectTypeOf, it } from "vitest";

import {
	bindQueryOptions,
	createQueryClient,
	type Feature,
	feature,
	group,
	groups,
	invalidateMany,
	type Link,
	link,
	type Operation,
	type QueryClient,
	type QueryInfo,
	type Target,
	tag,
} from "./index.ts";

interface TraceMeta {
	readonly traceId?: string;
}

function label(op: Operation<TraceMeta>): string {
	return op.meta.traceId ?? op.hash;
}

/** Logs every request, tagged with the query's `meta.traceId`. */
function traced(
	log: (line: string) => void,
): Link<{ readonly meta: TraceMeta }> {
	return link<{ readonly meta: TraceMeta }>(async (op, next) => {
		log(`start ${label(op)}`);
		try {
			return await next(op);
		} finally {
			log(`end ${label(op)}`);
		}
	});
}

interface OwnerMeta {
	readonly owner?: "billing" | "growth";
}

/** Counts cache events, and declares `meta.owner` for `ownedBy` to match on. */
function ownership(
	onEvent: (type: string) => void,
): Feature<{ readonly meta: OwnerMeta }> {
	return feature<{ readonly meta: OwnerMeta }>((client, signal) => {
		client.subscribe((event) => onEvent(event.type), { signal });
	});
}

/** A target over the `meta` the feature declares. */
const ownedBy: Target<OwnerMeta, OwnerMeta["owner"]> = {
	where: (query: QueryInfo<OwnerMeta>, owner) => query.meta.owner === owner,
};

const makeQueryClient = () =>
	createQueryClient({
		features: [ownership(() => {}), groups()],
		links: [traced(() => {})],
	});

const queryOptions = bindQueryOptions<typeof makeQueryClient>();
const reports = group("reports");
const team = tag<string>("team");

describe("extensions with public exports only", () => {
	it("type a root's meta by what its link and features declare", () => {
		const reportQuery = (input: { readonly id: number }) =>
			queryOptions({
				meta: { owner: "billing", tags: [team("core")], traceId: "r" },
				queryFn: () => ({ id: input.id }),
				queryKey: reports(input.id),
			});
		expectTypeOf(reportQuery).returns.not.toBeAny();

		queryOptions({
			// @ts-expect-error -- `owner` takes the feature's values only
			meta: { owner: "sales" },
			queryFn: () => 1,
			queryKey: reports("bad-owner"),
		});
		queryOptions({
			// @ts-expect-error -- no part declares `priority`
			meta: { priority: 1 },
			queryFn: () => 1,
			queryKey: reports("bad-key"),
		});
	});

	it("invalidate with the tags feature and a third-party target", () => {
		const client: QueryClient = makeQueryClient();
		expectTypeOf(invalidateMany(client, team, "core")).resolves.toBeVoid();
		expectTypeOf(invalidateMany(client, ownedBy, "growth")).resolves.toBeVoid();
		expectTypeOf(
			invalidateMany(client, [ownedBy, [team, "core"]]),
		).resolves.toBeVoid();
		// @ts-expect-error -- the target's parameter is an owner
		void invalidateMany(client, ownedBy, "sales");
	});
});
