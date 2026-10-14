import { type QueryHandle, useQuery } from "@raf-query/react";

import { commentsQuery } from "../queries";

declare function CommentSkeletons(): React.ReactNode;

// #region infinite-scroll
export function InfiniteScrollComments(props: {
	handle: QueryHandle<typeof commentsQuery>;
}) {
	const [, comments] = useQuery(commentsQuery, props.handle);
	return (
		<>
			{comments.isFetchingNextPage ? <CommentSkeletons /> : null}
			{comments.hasNextPage && !comments.isFetchingNextPage ? (
				<button
					onClick={() => comments.fetchNextPage()}
					ref={(button) => {
						if (button === null) return;
						const observer = new IntersectionObserver(
							(entries) => {
								if (entries.some((entry) => entry.isIntersecting)) {
									observer.disconnect();
									comments.fetchNextPage();
								}
							},
							{ rootMargin: "0px 0px 300px 0px" },
						);
						observer.observe(button);
						return () => observer.disconnect();
					}}
				>
					Load more
				</button>
			) : null}
		</>
	);
}
// #endregion
