/**
 * A boundary can't catch what one above it catches
 *
 * `Session` already catches `Unauthorized`. Each tag has one place in a
 * chain, so a boundary inside it that lists `Unauthorized` again is a type
 * error that names the tag.
 */
import { Boundary } from "@raf-query/experimental-effect-query";

import { DocAccess } from "../src/boundaries.tsx";

export const [Again, useAgain] = Boundary.catchErrors(DocAccess, {
	fallback: () => <p>Sign in again</p>,
	name: "Again",
	tags: ["Unauthorized"],
});
