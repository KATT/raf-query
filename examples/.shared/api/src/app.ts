import {
	addComment,
	countIssues,
	getIssue,
	getUser,
	listComments,
	listIssues,
	updateIssue,
} from "@examples/db";
import {
	AddCommentInput,
	Cursor,
	IssueId,
	IssueListInput,
	UpdateTitleInput,
	UserId,
} from "@examples/db/types";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { z } from "zod";

// Path and query values arrive as strings: coerce them, then check them with
// the db schemas.
const numeric = z.coerce.number<string>();
const IssueParam = z.object({ id: numeric.pipe(IssueId) });
const QueryCursor = numeric.pipe(Cursor);

const routes = new Hono()
	.get(
		"/issues",
		sValidator("query", IssueListInput.extend({ cursor: QueryCursor })),
		async (c) => c.json(await listIssues(c.req.valid("query"))),
	)
	// Registered before `/issues/:id`, which would match it too.
	.get("/issues/counts", async (c) => c.json(await countIssues()))
	.get("/issues/:id", sValidator("param", IssueParam), async (c) => {
		const issue = await getIssue(c.req.valid("param").id);
		return issue ? c.json(issue) : c.json({ error: "Issue not found" }, 404);
	})
	.patch(
		"/issues/:id",
		sValidator("param", IssueParam),
		sValidator("json", UpdateTitleInput.omit({ id: true })),
		async (c) =>
			c.json(
				await updateIssue({
					...c.req.valid("json"),
					id: c.req.valid("param").id,
				}),
			),
	)
	.get(
		"/issues/:id/comments",
		sValidator("param", IssueParam),
		sValidator("query", z.object({ cursor: QueryCursor })),
		async (c) =>
			c.json(
				await listComments({
					cursor: c.req.valid("query").cursor,
					issueId: c.req.valid("param").id,
				}),
			),
	)
	.post(
		"/issues/:id/comments",
		sValidator("param", IssueParam),
		sValidator("json", AddCommentInput.omit({ issueId: true })),
		async (c) =>
			c.json(
				await addComment({
					...c.req.valid("json"),
					issueId: c.req.valid("param").id,
				}),
				201,
			),
	)
	.get(
		"/users/:id",
		sValidator("param", z.object({ id: UserId })),
		async (c) => {
			const user = await getUser(c.req.valid("param").id);
			return user ? c.json(user) : c.json({ error: "User not found" }, 404);
		},
	);

/** The routes' types, for `hc`: paths are relative to `/api`. */
export type Api = typeof routes;

/** Serves the API under `/api`. Mount it on the framework's `/api/*` route. */
export const app = new Hono().route("/api", routes);
