/**
 * A caught tag must be the universe's type
 *
 * `DocAccess`'s fallback gets the universe's `Forbidden`, with a `docId`. A
 * query that fails with another `"Forbidden"` (an `orgId`, no `docId`) can't be
 * read through it: its failure would reach a fallback that reads `docId`.
 */
import type { QueryHandle } from "@raf-query/react";
import { queryOptions } from "@raf-query/react";
import { Data, Effect } from "effect";

import { useDocAccess } from "../src/boundaries.tsx";

class OrgForbidden extends Data.TaggedError("Forbidden")<{
	readonly orgId: string;
}> {}

export function orgQuery() {
	return queryOptions({
		queryFn: () => Effect.fail(new OrgForbidden({ orgId: "acme" })),
		queryKey: ["org"],
	});
}

export const OrgName = (props: {
	readonly org: QueryHandle<typeof orgQuery>;
}) => {
	const org = useDocAccess(orgQuery, props.org);
	return <p>{String(org)}</p>;
};
