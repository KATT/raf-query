/**
 * Once every error is caught, there is no failure to get
 *
 * A boundary that catches `DocNotFound` too leaves nothing, so its hook returns
 * the doc itself: no `Result`, nothing to match. `useSession` on the doc list is
 * the same: `Session` and the boundaries above it catch everything `ListDocs`
 * can fail with. This file compiles.
 */
import type { QueryHandle } from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";

import { DocNotFound } from "../src/api.ts";
import { DocAccess, useSession } from "../src/boundaries.tsx";
import { docListQuery, docQuery } from "../src/queries.ts";

export const [Everything, useEverything] = Boundary.catchErrors(DocAccess, {
	errors: [DocNotFound],
	fallback: (props) => <p>Doc {props.error.docId} is gone</p>,
	name: "Everything",
});

export const Title = (props: {
	readonly doc: QueryHandle<typeof docQuery>;
}) => {
	const doc = useEverything(docQuery, props.doc);
	return <h1>{doc.title}</h1>;
};

export const Titles = (props: {
	readonly list: QueryHandle<typeof docListQuery>;
}) => {
	const docs = useSession(docListQuery, props.list);
	return (
		<ul>
			{docs.map((doc) => (
				<li key={doc.id}>{doc.title}</li>
			))}
		</ul>
	);
};
