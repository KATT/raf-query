// #region props
import type { EnsuredQueryHandle, QueryHandle } from "@raf-query/react";
// #endregion
import { useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

import { commentsQuery, postQuery } from "../queries";
// #region props

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// ...
	// #endregion
	const [pagesPromise] = useQuery(commentsQuery, props.handle);
	const data = use(pagesPromise);
	return (
		<ul>
			{data.pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<li key={comment.id}>{comment.body}</li>
				))}
		</ul>
	);
	// #region props
}
// #endregion

export function PostComments(props: {
	comments: QueryHandle<typeof commentsQuery>;
	post: EnsuredQueryHandle<typeof postQuery>;
}) {
	const [post] = useQuery(postQuery, props.post);
	return (
		<section>
			<h2>Comments on {post.title}</h2>
			<Suspense fallback={<p>Loading comments…</p>}>
				<Comments handle={props.comments} />
			</Suspense>
		</section>
	);
}
