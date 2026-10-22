/**
 * A tag two errors share can't be caught
 *
 * Boundaries match by `_tag`, so they can't tell two errors with the same tag
 * apart. When the universe has two, say a second API's `Forbidden`, catching
 * that tag is a type error. Tags only one error carries still work.
 */
import { Boundary } from "@raf-query/experimental-effect-atom";

import type { AppError } from "../src/boundaries.tsx";

/** Another API's `Forbidden`, about an organization. */
interface OrgForbidden {
	readonly _tag: "Forbidden";
	readonly orgId: string;
}

const [Root] = Boundary.root({
	errors: Boundary.errors<AppError | OrgForbidden>(),
	fallback: () => <p>Crashed</p>,
	name: "Root",
});

export const [Access, useAccess] = Boundary.catchErrors(Root, {
	fallback: () => <p>No access</p>,
	name: "Access",
	tags: ["Forbidden"],
});

export const [Missing, useMissing] = Boundary.catchErrors(Root, {
	fallback: () => <p>Not found</p>,
	name: "Missing",
	tags: ["DocNotFound"],
});
