import {
	addComment as insertComment,
	countIssues as countIssuesInDb,
	getIssue as findIssue,
	getUser as findUser,
	listComments as listCommentsInDb,
	listIssues as listIssuesInDb,
	updateIssue,
} from "@examples/db";
import {
	AddCommentInput,
	CommentsInput,
	IssueId,
	IssueListInput,
	UpdateTitleInput,
} from "@examples/db/types";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

export const listIssues = createServerFn()
	.validator(Schema.toStandardSchemaV1(IssueListInput))
	.handler((context) => listIssuesInDb(context.data));

export const getIssue = createServerFn()
	.validator(Schema.toStandardSchemaV1(IssueId))
	.handler(async (context) => {
		const issue = await findIssue(context.data);
		if (!issue) {
			throw notFound();
		}
		return issue;
	});

export const countIssues = createServerFn().handler(() => countIssuesInDb());

export const getUser = createServerFn()
	.validator(Schema.toStandardSchemaV1(Schema.String))
	.handler(async (context) => {
		const user = await findUser(context.data);
		if (!user) {
			throw notFound();
		}
		return user;
	});

export const listComments = createServerFn()
	.validator(Schema.toStandardSchemaV1(CommentsInput))
	.handler((context) => listCommentsInDb(context.data));

export const updateIssueTitle = createServerFn({ method: "POST" })
	.validator(Schema.toStandardSchemaV1(UpdateTitleInput))
	.handler((context) => updateIssue(context.data));

export const addComment = createServerFn({ method: "POST" })
	.validator(Schema.toStandardSchemaV1(AddCommentInput))
	.handler((context) => insertComment(context.data));
