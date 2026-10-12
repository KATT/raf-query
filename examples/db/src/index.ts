import { seed } from "./seed.ts";
import {
	type Comment,
	currentUser,
	type CommentPage,
	type Issue,
	type IssueCounts,
	type IssueList,
	type IssueListInput,
	type IssueStatus,
	type Store,
	type User,
} from "./types.ts";

export * from "./types.ts";

export const ISSUES_PER_PAGE = 8;
export const COMMENTS_PER_PAGE = 4;

declare global {
	/** Survives dev-server module reloads, so edits aren't lost on save. */
	var exampleDbStore: Store | undefined;
}

function store(): Store {
	globalThis.exampleDbStore ??= seed();
	return globalThis.exampleDbStore;
}

/** Every call waits like a real database round trip: `DB_LATENCY_MS` ± 50%. */
async function latency() {
	const base = Number(process.env["DB_LATENCY_MS"] ?? 400);
	await new Promise((resolve) => {
		setTimeout(resolve, base * (0.5 + Math.random()));
	});
}

export async function listIssues(input: IssueListInput): Promise<IssueList> {
	await latency();
	const matching = store()
		.issues.filter(
			(issue) => input.status === "all" || issue.status === input.status,
		)
		.toSorted((a, b) =>
			input.sort === "newest"
				? b.createdAt.localeCompare(a.createdAt)
				: a.createdAt.localeCompare(b.createdAt),
		);
	const pageCount = Math.max(1, Math.ceil(matching.length / ISSUES_PER_PAGE));
	const page = Math.min(Math.max(1, input.page), pageCount);
	return {
		issues: matching.slice(
			(page - 1) * ISSUES_PER_PAGE,
			page * ISSUES_PER_PAGE,
		),
		page,
		pageCount,
		total: matching.length,
	};
}

export async function getIssue(id: number): Promise<Issue | null> {
	await latency();
	return store().issues.find((issue) => issue.id === id) ?? null;
}

export async function getUser(id: string): Promise<User | null> {
	await latency();
	return store().users.find((user) => user.id === id) ?? null;
}

export async function countIssues(): Promise<IssueCounts> {
	await latency();
	const issues = store().issues;
	const count = (status: IssueStatus) =>
		issues.filter((issue) => issue.status === status).length;
	return {
		all: issues.length,
		closed: count("closed"),
		in_progress: count("in_progress"),
		open: count("open"),
	};
}

/** Newest first; `cursor` is the index of the first comment to return. */
export async function listComments(input: {
	readonly cursor: number;
	readonly issueId: number;
}): Promise<CommentPage> {
	await latency();
	const comments = store()
		.comments.filter((comment) => comment.issueId === input.issueId)
		.toReversed();
	const end = input.cursor + COMMENTS_PER_PAGE;
	return {
		comments: comments.slice(input.cursor, end),
		nextCursor: end < comments.length ? end : null,
		total: comments.length,
	};
}

export async function updateIssue(input: {
	readonly id: number;
	readonly status?: IssueStatus;
	readonly title?: string;
}): Promise<Issue> {
	await latency();
	const data = store();
	const current = data.issues.find((issue) => issue.id === input.id);
	if (!current) {
		throw new Error(`Issue #${input.id} not found`);
	}
	const title = input.title?.trim();
	if (title === "") {
		throw new Error("Title can't be empty");
	}
	const updated: Issue = {
		...current,
		status: input.status ?? current.status,
		title: title ?? current.title,
	};
	data.issues = data.issues.map((issue) =>
		issue.id === input.id ? updated : issue,
	);
	return updated;
}

export async function addComment(input: {
	readonly body: string;
	readonly id: string;
	readonly issueId: number;
}): Promise<Comment> {
	await latency();
	const data = store();
	const body = input.body.trim();
	if (body === "") {
		throw new Error("Comment can't be empty");
	}
	if (data.comments.some((existing) => existing.id === input.id)) {
		throw new Error(`Comment ${input.id} already exists`);
	}
	const comment: Comment = {
		author: currentUser,
		body,
		createdAt: new Date().toISOString(),
		id: input.id,
		issueId: input.issueId,
	};
	data.comments = [...data.comments, comment];
	data.issues = data.issues.map((issue) =>
		issue.id === input.issueId
			? { ...issue, commentCount: issue.commentCount + 1 }
			: issue,
	);
	return comment;
}
