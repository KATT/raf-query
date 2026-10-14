/**
 * The RPC server, over the fake database. Server-only: it imports
 * `@examples/db`, which must stay out of the browser's bundle.
 */
import {
	addComment,
	countIssues,
	getIssue,
	getIssueAssignee,
	listComments,
	listIssues,
	updateIssue,
} from "@examples/db";
import { LATENCY_HEADER, parseLatency } from "@examples/db/types";
import { Effect, Layer, Option } from "effect";
import { Headers, HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

import { EmptyTitle, IssueNotFound, IssueRpcs } from "./rpc.ts";

/** The database options a request asked for in its headers. */
function options(request: { readonly headers: Headers.Headers }) {
	return {
		latencyMs: parseLatency(
			Option.getOrUndefined(Headers.get(request.headers, LATENCY_HEADER)),
		),
	};
}

const IssueHandlers = IssueRpcs.toLayer({
	AddComment: (payload, request) =>
		Effect.promise(() => addComment(payload, options(request))),
	CountIssues: (_payload, request) =>
		Effect.promise(() => countIssues(options(request))),
	GetIssue: (payload, request) =>
		Effect.promise(() => getIssue(payload.id, options(request))).pipe(
			Effect.flatMap((issue) =>
				issue
					? Effect.succeed(issue)
					: Effect.fail(new IssueNotFound({ id: payload.id })),
			),
		),
	GetIssueAssignee: (payload, request) =>
		Effect.promise(() =>
			getIssueAssignee(payload.issueId, options(request)),
		).pipe(
			Effect.flatMap((user) =>
				user
					? Effect.succeed(user)
					: Effect.fail(new IssueNotFound({ id: payload.issueId })),
			),
		),
	ListComments: (payload, request) =>
		Effect.promise(() => listComments(payload, options(request))),
	ListIssues: (payload, request) =>
		Effect.promise(() => listIssues(payload, options(request))),
	UpdateTitle: (payload, request) =>
		payload.title.trim() === ""
			? Effect.fail(new EmptyTitle())
			: Effect.promise(() => updateIssue(payload, options(request))),
});

const RpcRoute = RpcServer.layerHttp({
	group: IssueRpcs,
	path: "/rpc",
	protocol: "http",
}).pipe(Layer.provide([IssueHandlers, RpcSerialization.layerJson]));

/**
 * Serves `POST /rpc`: the `/rpc` server route in the browser's requests,
 * and the in-process transport during server rendering.
 */
export const rpcServer = HttpRouter.toWebHandler(RpcRoute, {
	disableLogger: true,
});

import.meta.hot?.dispose(() => rpcServer.dispose());
