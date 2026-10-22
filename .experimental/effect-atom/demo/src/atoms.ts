import { Reactivity } from "effect/reactivity";

import { DocsClient } from "./client.ts";

/** Fails with `Unauthorized | RpcClientError`. */
export const docListAtom = DocsClient.query("ListDocs", undefined, {
	reactivityKeys: ["docs"],
	timeToLive: "30 seconds",
});

/** Fails with `Forbidden | DocNotFound | Unauthorized | RpcClientError`. */
export const docAtom = (id: number) =>
	DocsClient.query(
		"GetDoc",
		{ id },
		{ reactivityKeys: ["docs"], timeToLive: "30 seconds" },
	);

/**
 * Fails with `Forbidden | DocNotFound | EmptyTitle | Unauthorized |
 * RpcClientError`. Write it with `reactivityKeys: ["docs"]`, and the doc
 * atoms refresh once it succeeds.
 */
export const renameDocAtom = DocsClient.mutation("RenameDoc");

/** Refreshes every atom with the `"docs"` reactivity key. */
export const invalidateDocsAtom = DocsClient.runtime.fn(() =>
	Reactivity.invalidate(["docs"]),
);
