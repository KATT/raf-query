/**
 * A boundary can't catch what one above it catches
 *
 * `Session` already catches `Unauthorized`, so a boundary inside it that lists
 * `Unauthorized` again would never see one.
 */
import { Boundary } from "@raf-query/experimental-effect-query";

import { Unauthorized } from "../src/api.ts";
import { DocAccess } from "../src/boundaries.tsx";

export const [Again, useAgain] = Boundary.catchErrors(DocAccess, {
	errors: [Unauthorized],
	fallback: () => <p>Sign in again</p>,
	name: "Again",
});
