/**
 * Once every error is caught, there is no failure to get
 *
 * A boundary that catches `DocNotFound` too leaves nothing: `useResult`'s
 * failure is `never`, and `use` returns the doc. This file compiles.
 */
import { Result } from "effect";

import { DocNotFound } from "../src/api.ts";
import { DocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

const Everything = DocAccess.catchErrors({
	errors: [DocNotFound],
	fallback: (props) => <p>Doc {props.error.docId} is gone</p>,
	name: "Everything",
});

export const Title = (props: { readonly id: number }) => {
	const doc = Everything.use(docQuery(props.id));
	return <h1>{doc.title}</h1>;
};

export const Body = (props: { readonly id: number }) => {
	const result = Everything.useResult(docQuery(props.id));
	if (Result.isFailure(result)) {
		const impossible: never = result.failure;
		return impossible;
	}
	return <p>{result.success.body}</p>;
};
