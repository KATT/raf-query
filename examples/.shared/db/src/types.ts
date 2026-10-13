import { z } from "zod";

export const issueStatuses = ["open", "in_progress", "closed"] as const;
export const IssueStatus = z.enum(issueStatuses);
export type IssueStatus = z.infer<typeof IssueStatus>;

export const issueSorts = ["newest", "oldest"] as const;
export const IssueSort = z.enum(issueSorts);
export type IssueSort = z.infer<typeof IssueSort>;

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

export const UserId = z.string();

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
