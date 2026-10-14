import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";

import { commentsQuery } from "../queries";

export function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [commentsPromise] = useQuery(commentsQuery, props.handle);
	const comments = use(commentsPromise);
	return (
		<ul>
			{(comments as Array<{ body: string }>).map((comment, index) => (
				<li key={index}>{comment.body}</li>
			))}
		</ul>
	);
}

export function CommentsSkeleton() {
	return <p>Loading comments…</p>;
}
