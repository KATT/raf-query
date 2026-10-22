/**
 * Once every error is caught, there is no failure to get
 *
 * A boundary that catches `DocNotFound` too leaves nothing, so its hook returns
 * the doc itself: no `Unhandled`, nothing to match. `useSession(docListAtom)`
 * is the same: `Session` and the boundaries above it catch everything
 * `ListDocs` can fail with. The fallback's `error` is the universe's
 * `DocNotFound`, with its `docId`. This file compiles.
 */
import { Boundary } from "@raf-query/experimental-effect-atom";

import { docAtom, docListAtom } from "../src/atoms.ts";
import { DocAccess, useSession } from "../src/boundaries.tsx";

export const [Everything, useEverything] = Boundary.catchErrors(DocAccess, {
	fallback: (props) => <p>Doc {props.error.docId} is gone</p>,
	name: "Everything",
	tags: ["DocNotFound"],
});

export const Title = (props: { readonly id: number }) => {
	const doc = useEverything(docAtom(props.id));
	return <h1>{doc.title}</h1>;
};

export const Titles = () => {
	const docs = useSession(docListAtom);
	return (
		<ul>
			{docs.map((doc) => (
				<li key={doc.id}>{doc.title}</li>
			))}
		</ul>
	);
};
