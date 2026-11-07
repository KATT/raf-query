import { type QueryHandle, useQuery } from "@raf-query/react";
import { type ReactNode, use } from "react";
import { commentsQuery } from "~/queries.ts";

declare function Comment(props: {
	readonly author: string;
	readonly body: string;
}): ReactNode;

// #region reading-pages
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesThenable, comments] = useQuery(commentsQuery, props.handle);
	const data = use(pagesThenable);
	//    ^?

	return (
		<>
			{data.pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<Comment
						key={comment.id}
						author={comment.author}
						body={comment.body}
					/>
				))}
			<button
				disabled={!comments.hasNextPage || comments.isFetchingNextPage}
				onClick={() => comments.fetchNextPage()}
			>
				Load more
			</button>
		</>
	);
}
// #endregion

declare function CommentSkeletons(): ReactNode;

declare const props: { handle: QueryHandle<typeof commentsQuery> };

const [, comments] = useQuery(commentsQuery, props.handle);

// #region infinite-scroll
{
	comments.isFetchingNextPage ? <CommentSkeletons /> : null;
}
{
	comments.hasNextPage && !comments.isFetchingNextPage ? (
		<button
			onClick={() => comments.fetchNextPage()}
			ref={(button) => {
				if (button === null) return;
				const observer = new IntersectionObserver(
					(entries) => {
						if (entries.some((entry) => entry.isIntersecting)) {
							observer.disconnect();
							void comments.fetchNextPage();
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
	) : null;
}
// #endregion
