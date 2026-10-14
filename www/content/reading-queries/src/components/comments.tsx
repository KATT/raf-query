import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { commentsQuery } from "../queries";

export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [commentsPromise] = useQuery(commentsQuery, props.handle);
	return (
		<ul>
			{use(commentsPromise).map((comment) => (
				<li key={comment.id}>
					<strong>{comment.author}</strong> {comment.body}
				</li>
			))}
		</ul>
	);
}

export function CommentsSkeleton() {
	return <p>Loading comments…</p>;
}
