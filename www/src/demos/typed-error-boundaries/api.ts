/**
 * The demo's RPC contract. A procedure's error union is what the client sees:
 * its own `error`, the `Session` middleware's `Unauthorized`, and the
 * transport's `RpcClientError`. Only `client.ts` imports it at runtime.
 */
import { Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
	docId: Schema.Int,
}) {}

export class DocNotFound extends Schema.TaggedError<DocNotFound>()(
	"DocNotFound",
	{ docId: Schema.Int },
) {}

export class Doc extends Schema.Opaque<Doc>()(
	Schema.Struct({
		body: Schema.String,
		id: Schema.Int,
		title: Schema.String,
	}),
) {}

export class Session extends RpcMiddleware.Service<Session>()("demo/Session", {
	error: Unauthorized,
}) {}

export const DocRpcs = RpcGroup.make(
	Rpc.make("ListDocs", { success: Schema.Array(Doc) }),
	Rpc.make("GetDoc", {
		error: Schema.Union([Forbidden, DocNotFound]),
		payload: { id: Schema.Int },
		success: Doc,
	}),
).middleware(Session);
