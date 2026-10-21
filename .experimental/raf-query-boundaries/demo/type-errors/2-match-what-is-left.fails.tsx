/**
 * What's left must be matched exhaustively
 *
 * Read through `Session`, a doc can still fail with `Forbidden` or
 * `DocNotFound`: both come back in the `Result`. Forgetting one is a type
 * error that names it.
 */
import type { QueryHandle } from "@raf-query/react";
import { Match, Result } from "effect";

import { Session } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly doc: QueryHandle<typeof docQuery> }) =>
	Result.match(Session.useResult(docQuery, props.doc), {
		onFailure: (error) =>
			Match.valueTags(error, {
				DocNotFound: () => <p>No such doc</p>,
			}),
		onSuccess: (doc) => <h1>{doc.title}</h1>,
	});
