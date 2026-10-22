/**
 * An action's errors are checked the same way
 *
 * `Boundary.useRun(DocAccess)` runs an Effect with the client's services, and
 * resolves with what a read through `DocAccess` would return: `RenameDoc` can
 * also fail with `DocNotFound` and `EmptyTitle`, so the result is
 * `Doc | Unhandled<DocNotFound | EmptyTitle>`.
 */
import { Boundary } from "@raf-query/react/boundary";

import { DocAccess } from "../src/boundaries.tsx";
import { renameDoc } from "../src/queries.ts";

export const Rename = (props: { readonly id: number }) => {
	const run = Boundary.useRun(DocAccess);
	return (
		<button
			onClick={async () => {
				const doc = await run(renameDoc(props.id, "New title"));
				return doc.title;
			}}
			type="button"
		>
			Rename
		</button>
	);
};
