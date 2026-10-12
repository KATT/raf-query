import { z } from "zod";

export const issueStatuses = ["open", "in_progress", "closed"] as const;
export const IssueStatus = z.enum(issueStatuses);
export type IssueStatus = z.infer<typeof IssueStatus>;

export const issueSorts = ["newest", "oldest"] as const;
export const IssueSort = z.enum(issueSorts);
export type IssueSort = z.infer<typeof IssueSort>;

const Id = z.int().positive();
const Text = z.string().trim().min(1);

/**
 * What the issue list shows. Lives in the URL's search params; missing keys
 * get defaults.
 */
export const IssueListInput = z.object({
	page: Id.default(1),
	sort: IssueSort.default("newest"),
	status: z.enum(["all", ...issueStatuses]).default("all"),
});
export type IssueListInput = z.infer<typeof IssueListInput>;

/** {@link IssueListInput} as URL search params, where every value is a string. */
export const IssueListSearchParams = IssueListInput.extend({
	page: z.coerce.number<string>().pipe(Id).default(1),
});

export const IssueId = Id;

export const UserId = z.string();

export const CommentsInput = z.object({
	cursor: z.int().nonnegative(),
	issueId: Id,
});
export type CommentsInput = z.infer<typeof CommentsInput>;

export const UpdateTitleInput = z.object({ id: Id, title: Text });
export type UpdateTitleInput = z.infer<typeof UpdateTitleInput>;

export const AddCommentInput = z.object({ body: Text, issueId: Id });
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
	readonly id: number;
	readonly issueId: number;
}

export interface IssueList {
	readonly issues: ReadonlyArray<Issue>;
	readonly page: number;
	readonly pageCount: number;
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
