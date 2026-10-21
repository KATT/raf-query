/**
 * Once every error is caught, there is no failure to get
 *
 * A boundary that catches `DocNotFound` too leaves nothing, so its hook returns
 * the doc itself: no `Result`, nothing to match. `useSession(docList)` is the
 * same: `Session` and the boundaries above it catch everything `ListDocs` can
 * fail with. This file compiles.
 */
import { Boundary } from "@raf-query/experimental-effect-query";

import { DocNotFound } from "../src/api.ts";
import { DocAccess, useSession } from "../src/boundaries.tsx";
import { docList, docQuery } from "../src/queries.ts";

export const [Everything, useEverything] = Boundary.catchErrors(DocAccess, {
	errors: [DocNotFound],
	fallback: (props) => <p>Doc {props.error.docId} is gone</p>,
	name: "Everything",
});

export const Title = (props: { readonly id: number }) => {
	const doc = useEverything(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};

export const Titles = () => {
	const docs = useSession(docList);
	return (
		<ul>
			{docs.map((doc) => (
				<li key={doc.id}>{doc.title}</li>
			))}
		</ul>
	);
};
