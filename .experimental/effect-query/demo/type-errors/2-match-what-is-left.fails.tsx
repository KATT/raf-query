/**
 * What's left must be matched exhaustively
 *
 * Read through `Session`, a doc can still fail with `Forbidden` or
 * `DocNotFound`: both come back as an `Unhandled`. Forgetting one is a type
 * error that names it.
 */
import { Boundary } from "@raf-query/experimental-effect-query";
import { Match } from "effect";

import { useSession } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly id: number }) => {
	const doc = useSession(docQuery(props.id));
	if (Boundary.isUnhandled(doc)) {
		return (
			<p>{Match.valueTags(doc.error, { DocNotFound: () => "No such doc" })}</p>
		);
	}
	return <h1>{doc.title}</h1>;
};
