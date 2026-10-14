import { infiniteQueryOptions } from "@raf-query/react";

import { listComments, listMessages } from "./api";

export type { PostComment } from "./api";

// #region comments-query
export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ slug: input.slug, cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
// #endregion

declare const channelInput: { around: string; channel: string };

// #region bidirectional-messages
infiniteQueryOptions({
	queryKey: ["messages", channelInput.channel],
	queryFn: (context) =>
		listMessages({ channel: channelInput.channel, cursor: context.pageParam }),
	initialPageParam: channelInput.around,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
	getPreviousPageParam: (firstPage) => firstPage.previousCursor,
});
// #endregion
