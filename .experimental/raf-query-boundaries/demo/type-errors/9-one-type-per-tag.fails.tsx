/**
 * A tag must name one error
 *
 * Boundaries match failures by tag. Add a second error tagged `"Forbidden"` to
 * the universe, and a boundary that catches `"Forbidden"` can't say which one
 * its fallback gets, so it doesn't type-check.
 */
import { Boundary } from "@raf-query/react/boundary";
import { Data } from "effect";

import type { AppError } from "../src/boundaries.tsx";
import { client } from "../src/client.ts";

class OrgForbidden extends Data.TaggedError("Forbidden")<{
	readonly orgId: string;
}> {}

const [Org] = Boundary.root({
	client,
	errors: Boundary.errors<AppError | OrgForbidden>(),
	fallback: () => <p>Crashed</p>,
	name: "Org",
});

export const [OrgAccess, useOrgAccess] = Boundary.catchErrors(Org, {
	fallback: () => <p>No access</p>,
	name: "OrgAccess",
	tags: ["Forbidden"],
});
