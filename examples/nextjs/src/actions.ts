"use server";

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
import { Schema } from "effect";
import { notFound } from "next/navigation";

// Server actions are public endpoints: the parameter types are for callers,
// the schemas check what actually arrives.

export async function listIssues(input: IssueListInput) {
	return listIssuesInDb(Schema.decodeUnknownSync(IssueListInput)(input));
}

export async function getIssue(id: number) {
	const issue = await findIssue(Schema.decodeUnknownSync(IssueId)(id));
	if (!issue) {
		notFound();
	}
	return issue;
}

export async function countIssues() {
	return countIssuesInDb();
}

export async function getUser(id: string) {
	const user = await findUser(Schema.decodeUnknownSync(Schema.String)(id));
	if (!user) {
		notFound();
	}
	return user;
}

export async function listComments(input: CommentsInput) {
	return listCommentsInDb(Schema.decodeUnknownSync(CommentsInput)(input));
}

export async function updateIssueTitle(input: UpdateTitleInput) {
	return updateIssue(Schema.decodeUnknownSync(UpdateTitleInput)(input));
}

export async function addComment(input: AddCommentInput) {
	return insertComment(Schema.decodeUnknownSync(AddCommentInput)(input));
}
