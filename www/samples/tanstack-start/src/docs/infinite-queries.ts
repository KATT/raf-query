import { group, infiniteQueryOptions } from "@raf-query/react";
import { listComments } from "~/api.ts";
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

interface MessagePage {
	readonly items: ReadonlyArray<{ readonly id: string; readonly body: string }>;
	readonly nextCursor: string | null;
	readonly previousCursor: string | null;
}

declare function listMessages(input: {
	readonly channel: string;
	readonly cursor: string;
	readonly signal: AbortSignal;
}): Promise<MessagePage>;

declare const input: { channel: string; around: string };

const messages = group("messages");

// #region bidirectional-lists
infiniteQueryOptions({
	queryKey: messages(input.channel),
	queryFn: (context) =>
		listMessages({
			channel: input.channel,
			cursor: context.pageParam,
			signal: context.signal,
		}),
	initialPageParam: input.around,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
	getPreviousPageParam: (firstPage) => firstPage.previousCursor,
});
// #endregion
