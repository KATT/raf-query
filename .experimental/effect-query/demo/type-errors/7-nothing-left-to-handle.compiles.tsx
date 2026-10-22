/**
 * Once every error is caught, the data hook returns the data
 *
 * A boundary that catches `DocNotFound` too leaves nothing, so its data hook
 * takes the query and returns the doc itself: no `Result`, nothing to match.
 * `useSession(docList)` is the same: `Session` and the boundaries above it
 * catch everything `ListDocs` can fail with. This file compiles.
 */
import { Boundary } from "@raf-query/experimental-effect-query";

import { DocAccess, useSession } from "../src/boundaries.tsx";
import { docList, docQuery } from "../src/queries.ts";

export const [Everything, useEverything] = Boundary.catchErrors(DocAccess, {
	fallback: (props) => <p>Doc {props.error.docId} is gone</p>,
	name: "Everything",
	tags: ["DocNotFound"],
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
