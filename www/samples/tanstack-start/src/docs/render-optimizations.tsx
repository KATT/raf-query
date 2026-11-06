import { type DefinedQueryHandle, useQuery } from "@raf-query/react";
import { type ReactNode, use } from "react";
import type { Todo } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: DefinedQueryHandle<typeof postQuery> };

declare function CommentsSection(): ReactNode;

// #region reading-where-the-data-is-used
function PostPage() {
	// Passes the handle down; doesn't read the query.
	return (
		<>
			<RefreshButton handle={loaderData.post} />
			<PostBody handle={loaderData.post} />
			<CommentsSection />
		</>
	);
}

function RefreshButton(props: {
	handle: DefinedQueryHandle<typeof postQuery>;
}) {
	const [, controls] = useQuery(postQuery, props.handle);
	return (
		<button disabled={controls.isFetching} onClick={() => controls.refetch()}>
			Refresh
		</button>
	);
}

function PostBody(props: { handle: DefinedQueryHandle<typeof postQuery> }) {
	const [post] = useQuery(postQuery, props.handle);
	return <article>{post.body}</article>;
}
// #endregion

declare const todosPromise: Promise<ReadonlyArray<Todo>>;

// #region deriving-in-render
const todos = use(todosPromise);
const done = todos.filter((todo) => todo.done);
// #endregion
