/**
 * An action's errors are checked the same way
 *
 * `useRun()` runs an Effect with the client's services. Called directly, it
 * resolves with the success, so it only type-checks when the chain catches
 * everything: `RenameDoc` can also fail with `DocNotFound` and `EmptyTitle`.
 * `run.result` hands those back in a `Result`.
 */
import { DocAccess } from "../src/boundaries.tsx";
import { renameDoc } from "../src/queries.ts";

export const Rename = (props: { readonly id: number }) => {
	const run = DocAccess.useRun();
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
