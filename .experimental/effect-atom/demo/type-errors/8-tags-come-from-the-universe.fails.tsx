/**
 * A tag must be one of the universe's
 *
 * The root declares `AppError`, everything a `DocsClient` query can fail with,
 * so a boundary's tags autocomplete from it, and a misspelt one is a type
 * error with a suggestion instead of a boundary that never catches anything.
 */
import { Boundary } from "@raf-query/experimental-effect-atom";

import { Session } from "../src/boundaries.tsx";

export const [Access, useAccess] = Boundary.catchErrors(Session, {
	fallback: () => <p>No access</p>,
	name: "Access",
	tags: ["Forbiden"],
});
