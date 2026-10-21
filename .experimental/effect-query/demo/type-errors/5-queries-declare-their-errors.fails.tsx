/**
 * A query declares every error its Effect can fail with
 *
 * A query lists its errors' schemas, like an `Rpc` does: they are its error
 * type, and what a boundary's hook checks at runtime to know whether anything
 * is left. `GetDoc` can also fail with `DocNotFound` and the transport's
 * `RpcClientError`, so an Effect that fails with more than the list doesn't
 * type-check.
 */
import { Effect } from "effect";
import { Query } from "@raf-query/experimental-effect-query";

import { Forbidden, Unauthorized } from "../src/api.ts";
import { DocsClient } from "../src/client.ts";

export const docQuery = (id: number) =>
	Query.make({
		effect: Effect.flatMap(DocsClient, (docs) => docs.GetDoc({ id })),
		errors: [Forbidden, Unauthorized],
		key: ["docs", id],
	});
