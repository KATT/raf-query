import { Effect, Schema } from "effect";

export const issueStatuses = ["open", "in_progress", "closed"] as const;
export const IssueStatus = Schema.Literals(issueStatuses);
export type IssueStatus = typeof IssueStatus.Type;

export const issueSorts = ["newest", "oldest"] as const;
export const IssueSort = Schema.Literals(issueSorts);
export type IssueSort = typeof IssueSort.Type;

const Id = Schema.Int.check(Schema.isGreaterThan(0));
const Text = Schema.Trim.check(Schema.isNonEmpty());

/**
 * What the issue list shows. Lives in the URL's search params; missing keys
 * get defaults.
 */
export const IssueListInput = Schema.Struct({
	page: Id.pipe(Schema.withDecodingDefault(Effect.succeed(1))),
	sort: IssueSort.pipe(Schema.withDecodingDefault(Effect.succeed("newest"))),
	status: Schema.Literals(["all", ...issueStatuses]).pipe(
		Schema.withDecodingDefault(Effect.succeed("all")),
	),
});
export type IssueListInput = typeof IssueListInput.Type;

/** {@link IssueListInput} as URL search params, where every value is a string. */
export const IssueListSearchParams = Schema.Struct({
	page: Schema.optional(Schema.FiniteFromString),
	sort: Schema.optional(IssueSort),
	status: Schema.optional(Schema.Literals(["all", ...issueStatuses])),
}).pipe(Schema.decodeTo(IssueListInput));

export const IssueId = Id;

export const CommentsInput = Schema.Struct({
	cursor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	issueId: Id,
});

export const UpdateTitleInput = Schema.Struct({ id: Id, title: Text });

export const AddCommentInput = Schema.Struct({ body: Text, issueId: Id });

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

export interface Comment {
	readonly authorId: string;
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
