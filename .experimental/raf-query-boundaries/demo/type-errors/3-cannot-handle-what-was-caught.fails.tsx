/**
 * You can't handle an error a boundary already caught
 *
 * Under `DocAccess`, what's left is `DocNotFound` and nothing else. An
 * `Unauthorized` can't reach this component (`Session` caught it), so a case
 * for it is a type error, not dead code.
 */
import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { Match } from "effect";

import { useDocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: {
	readonly doc: QueryHandle<typeof docQuery>;
}) => {
	const doc = useDocAccess(docQuery, props.doc);
	if (Boundary.isUnhandled(doc)) {
		return (
			<p>
				{Match.valueTags(doc.error, {
					DocNotFound: () => "No such doc",
					Unauthorized: () => "Sign in",
				})}
			</p>
		);
	}
	return <h1>{doc.title}</h1>;
};
