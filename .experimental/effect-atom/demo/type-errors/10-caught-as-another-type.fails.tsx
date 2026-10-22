/**
 * An atom can't carry a caught tag as another type
 *
 * `DocAccess`'s fallback expects the universe's `Forbidden`, with a `docId`.
 * An atom outside the universe that fails with its own `Forbidden` would hand
 * that fallback a value its props don't describe, so reading it through
 * `DocAccess` is a type error. Through `Network`, which doesn't catch
 * `Forbidden`, it would come back as an `Unhandled`.
 */
import { Effect } from "effect";
import { Atom } from "effect/reactivity";

import { useDocAccess } from "../src/boundaries.tsx";

class OrgForbidden {
	readonly _tag = "Forbidden";
	readonly orgId = "acme";
}

const orgAtom = Atom.make(Effect.fail(new OrgForbidden()));

export const Org = () => {
	const org = useDocAccess(orgAtom);
	return <p>{String(org)}</p>;
};
