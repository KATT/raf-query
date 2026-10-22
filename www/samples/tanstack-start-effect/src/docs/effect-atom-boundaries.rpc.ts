import type { Boundary } from "@raf-query/experimental-effect-atom";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { EmptyTitle, IssueNotFound, Unauthorized } from "~/issues.ts";

const Issue = Schema.Struct({ id: Schema.Number, title: Schema.String });

// #region rpc-errors
export const IssueRpcs = RpcGroup.make(
	Rpc.make("GetIssue", {
		error: Schema.Union([IssueNotFound, Unauthorized]),
		payload: { id: Schema.Number },
		success: Issue,
	}),
	Rpc.make("RenameIssue", {
		error: Schema.Union([EmptyTitle, Unauthorized]),
		payload: { id: Schema.Number, title: Schema.String },
		success: Issue,
	}),
);

export type AppError = Boundary.RpcErrors<typeof IssueRpcs>;
//          ^?
// #endregion
