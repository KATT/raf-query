import { infiniteQueryOptions } from "~/raf.ts";
import { listComments, type PostComment } from "~/api.ts";
import { comments } from "~/queries.ts";

// #region intro
export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: comments(input.slug),
		queryFn: (context) =>
			listComments({ slug: input.slug, cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
// #endregion

interface CommentWindow {
	readonly items: ReadonlyArray<PostComment>;
	readonly nextCursor: string | null;
	readonly previousCursor: string | null;
}

declare function listCommentsAround(input: {
	readonly cursor: string;
	readonly signal: AbortSignal;
	readonly slug: string;
}): Promise<CommentWindow>;

// A link to one comment: `/posts/hello-world?comment=c42`
declare const input: { slug: string; comment: string };

// #region bidirectional-lists
infiniteQueryOptions({
	queryKey: comments(input.slug, "around", input.comment),
	queryFn: (context) =>
		listCommentsAround({
			cursor: context.pageParam,
			signal: context.signal,
			slug: input.slug,
		}),
	initialPageParam: input.comment,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
	getPreviousPageParam: (firstPage) => firstPage.previousCursor,
});
// #endregion

// #region opened-at-an-item
infiniteQueryOptions({
	// The thread, wherever it opens: one entry for every linked comment.
	queryKey: comments(input.slug, "around"),
	queryFn: (context) =>
		listCommentsAround({
			cursor: context.pageParam,
			signal: context.signal,
			slug: input.slug,
		}),
	initialPageParam: input.comment,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
	getPreviousPageParam: (firstPage) => firstPage.previousCursor,
	// The thread on screen has the linked comment: keep it.
	keepPages: (data) =>
		data.pages.some((page) =>
			page.items.some((comment) => comment.id === input.comment),
		),
});
// #endregion
