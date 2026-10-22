/**
 * The docs app's RPC contract. Each procedure's error union is what the
 * client sees: its own `error`, plus the `Session` middleware's
 * `Unauthorized`, plus the transport's `RpcClientError`.
 */
import { Context, Schema } from "effect";
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

export class EmptyTitle extends Schema.TaggedError<EmptyTitle>()(
	"EmptyTitle",
	{},
) {}

export const DocSummary = Schema.Struct({
	id: Schema.Int,
	locked: Schema.Boolean,
	title: Schema.String,
});

export const Doc = Schema.Struct({
	body: Schema.String,
	id: Schema.Int,
	title: Schema.String,
	updatedBy: Schema.String,
});

export class CurrentUser extends Context.Service<
	CurrentUser,
	{ readonly name: string }
>()("docs/CurrentUser") {}

/** Every procedure needs a session: without one, it fails with `Unauthorized`. */
export class Session extends RpcMiddleware.Service<
	Session,
	{ provides: CurrentUser }
>()("docs/Session", { error: Unauthorized }) {}

export const DocRpcs = RpcGroup.make(
	Rpc.make("ListDocs", { success: Schema.Array(DocSummary) }),
	Rpc.make("GetDoc", {
		error: Schema.Union([Forbidden, DocNotFound]),
		payload: { id: Schema.Int },
		success: Doc,
	}),
	Rpc.make("RenameDoc", {
		error: Schema.Union([Forbidden, DocNotFound, EmptyTitle]),
		payload: { id: Schema.Int, title: Schema.String },
		success: Doc,
	}),
).middleware(Session);
