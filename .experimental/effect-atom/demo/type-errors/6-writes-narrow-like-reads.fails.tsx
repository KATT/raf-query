/**
 * A write through a boundary narrows like a read
 *
 * `Boundary.useSet(DocAccess, renameDocAtom)` sends `Forbidden`,
 * `Unauthorized` and `RpcClientError` to the boundaries, and resolves to
 * `Doc | Unhandled<DocNotFound | EmptyTitle>`: the new title is behind
 * `Boundary.isUnhandled` too.
 */
import { Boundary } from "@raf-query/experimental-effect-atom";

import { renameDocAtom } from "../src/atoms.ts";
import { DocAccess } from "../src/boundaries.tsx";

export const useRenameTo = (id: number) => {
	const rename = Boundary.useSet(DocAccess, renameDocAtom);
	return async (title: string): Promise<string> => {
		const doc = await rename({
			payload: { id, title },
			reactivityKeys: ["docs"],
		});
		return doc.title;
	};
};
