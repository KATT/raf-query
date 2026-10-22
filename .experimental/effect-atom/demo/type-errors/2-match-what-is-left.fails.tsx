/**
 * What's left must be matched exhaustively
 *
 * Read through `Session`, a doc can still fail with `Forbidden` or
 * `DocNotFound`: both come back in the `Unhandled`. Forgetting one is a type
 * error that names it.
 */
import { Boundary } from "@raf-query/experimental-effect-atom";
import { Match } from "effect";

import { docAtom } from "../src/atoms.ts";
import { useSession } from "../src/boundaries.tsx";

export const Title = (props: { readonly id: number }) => {
	const doc = useSession(docAtom(props.id));
	if (Boundary.isUnhandled(doc)) {
		return (
			<p>
				{Match.valueTags(doc.error, {
					DocNotFound: () => "No such doc",
				})}
			</p>
		);
	}
	return <h1>{doc.title}</h1>;
};
