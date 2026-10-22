/**
 * A boundary catches tags of the root's errors
 *
 * The root declares, as a type, what its queries can fail with: everything
 * the docs RPC client can. A tag none of those errors has is a type error,
 * and the compiler suggests the one you meant.
 */
import { Boundary } from "@raf-query/experimental-effect-query";

import { Session } from "../src/boundaries.tsx";

export const [Access, useAccess] = Boundary.catchErrors(Session, {
	fallback: () => <p>No access</p>,
	name: "Access",
	tags: ["Forbiden"],
});
