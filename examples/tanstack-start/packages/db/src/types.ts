import { z } from "zod";

export const issueStatuses = ["open", "in_progress", "closed"] as const;
export const IssueStatus = z.enum(issueStatuses);
export type IssueStatus = z.infer<typeof IssueStatus>;

export const issueSorts = ["newest", "oldest"] as const;
export const IssueSort = z.enum(issueSorts);
export type IssueSort = z.infer<typeof IssueSort>;

/** The cookie the apps' settings menu stores the database latency in, in ms. */
export const LATENCY_COOKIE = "db-latency";

/**
 * The request header that sets the database latency for one API request, in
 * ms. The apps' API clients send the settings menu's choice in it.
 */
export const LATENCY_HEADER = "x-db-latency";

/** The latency when neither the request nor `DB_LATENCY_MS` sets one. */
export const DEFAULT_LATENCY_MS = 400;

export const latencyOptions = [
	{ label: "None", ms: 0 },
	{ label: "100 ms", ms: 100 },
	{ label: "400 ms", ms: 400 },
	{ label: "1 s", ms: 1000 },
	{ label: "3 s", ms: 3000 },
] as const;

/** A latency cookie or header, or `undefined` when it's missing or not a choice. */
export function parseLatency(value: string | undefined) {
	return latencyOptions.find((option) => String(option.ms) === value)?.ms;
}

const Id = z.int().positive();
const Text = z.string().trim().min(1);

/** Index of a page's first item. */
export const Cursor = z.int().nonnegative();

/**
 * What the issue list shows. Lives in the URL's search params; missing keys
 * get defaults. Pages are loaded by scrolling, so they stay out of the URL.
 */
export const IssueListInput = z.object({
	sort: IssueSort.default("newest"),
	status: z.enum(["all", ...issueStatuses]).default("all"),
});
export type IssueListInput = z.infer<typeof IssueListInput>;

export const IssuePageInput = IssueListInput.extend({ cursor: Cursor });
export type IssuePageInput = z.infer<typeof IssuePageInput>;

export const IssueId = Id;

export const CommentsInput = z.object({ cursor: Cursor, issueId: Id });
export type CommentsInput = z.infer<typeof CommentsInput>;

export const UpdateTitleInput = z.object({ id: Id, title: Text });
export type UpdateTitleInput = z.infer<typeof UpdateTitleInput>;

/** The client picks `id`, so its optimistic entry and the saved comment match. */
export const AddCommentInput = z.object({
	body: Text,
	id: z.uuid(),
	issueId: Id,
});
export type AddCommentInput = z.infer<typeof AddCommentInput>;

export interface User {
	readonly id: string;
	readonly name: string;
	readonly title: string;
}

export interface Issue {
	readonly assigneeId: string;
	readonly body: string;
	readonly commentCount: number;
	/** ISO date. */
	readonly createdAt: string;
	readonly id: number;
	readonly status: IssueStatus;
	readonly title: string;
}

/** Who the example apps are signed in as. */
export const currentUser: User = {
	id: "ada",
	name: "Ada Lovelace",
	title: "Analyst",
};

export interface Comment {
	readonly author: User;
	readonly body: string;
	/** ISO date. */
	readonly createdAt: string;
	readonly id: string;
	readonly issueId: number;
}

export interface IssuePage {
	readonly issues: ReadonlyArray<Issue>;
	readonly nextCursor: number | null;
	readonly total: number;
}

export interface CommentPage {
	readonly comments: ReadonlyArray<Comment>;
	readonly nextCursor: number | null;
	readonly total: number;
}

export type IssueCounts = Readonly<Record<IssueStatus | "all", number>>;

export interface Store {
	comments: ReadonlyArray<Comment>;
	issues: ReadonlyArray<Issue>;
	readonly users: ReadonlyArray<User>;
}
