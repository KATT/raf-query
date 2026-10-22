/**
 * What's left must be matched exhaustively
 *
 * Read through `Session`, a doc can still fail with `Forbidden` or
 * `DocNotFound`: both come back as the `Unhandled`'s error. Forgetting one is
 * a type error that names it.
 */
import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Match } from "effect";

import { useSession } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: {
	readonly doc: QueryHandle<typeof docQuery>;
}) => {
	const doc = useSession(docQuery, props.doc);
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
