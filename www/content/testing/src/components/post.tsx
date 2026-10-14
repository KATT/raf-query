import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

import { postQuery } from "../queries";

export function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postPromise] = useQuery(postQuery, props.handle);
	const post = use(postPromise);
	return <h1>{post.title}</h1>;
}

export function PostTestWrapper(props: {
	handle: QueryHandle<typeof postQuery>;
}) {
	return (
		<Suspense fallback="Loading…">
			<Post handle={props.handle} />
		</Suspense>
	);
}
