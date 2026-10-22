/**
 * A boundary can't catch what one above it catches
 *
 * `Session` already catches `Unauthorized`, so a boundary inside it that lists
 * the tag again would never see one. The error names the tag.
 */
import { Boundary } from "@raf-query/experimental-effect-atom";

import { DocAccess } from "../src/boundaries.tsx";

export const [Again, useAgain] = Boundary.catchErrors(DocAccess, {
	fallback: () => <p>Sign in again</p>,
	name: "Again",
	tags: ["DocNotFound", "Unauthorized"],
});
