import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import type { PostComment } from "../api";
import { commentsQuery } from "../queries";

declare function Comment(props: PostComment): React.ReactNode;

// #region reading-pages
export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const data = use(pagesPromise);
	//    ^?

	return (
		<>
			{data.pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<Comment key={comment.id} {...comment} />
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
