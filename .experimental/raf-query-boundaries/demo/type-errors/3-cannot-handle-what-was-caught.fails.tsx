/**
 * You can't handle an error a boundary already caught
 *
 * Under `DocAccess`, the failure is `DocNotFound` and nothing else. An
 * `Unauthorized` can't reach this component (`Session` caught it), so a case
 * for it is a type error, not dead code.
 */
import type { QueryHandle } from "@raf-query/react";
import { Match, Result } from "effect";

import { DocAccess } from "../src/boundaries.tsx";
import { docQuery } from "../src/queries.ts";

export const Title = (props: { readonly doc: QueryHandle<typeof docQuery> }) =>
	Result.match(DocAccess.useResult(docQuery, props.doc), {
		onFailure: (error) =>
			Match.valueTags(error, {
				DocNotFound: () => <p>No such doc</p>,
				Unauthorized: () => <p>Sign in</p>,
			}),
		onSuccess: (doc) => <h1>{doc.title}</h1>,
	});
