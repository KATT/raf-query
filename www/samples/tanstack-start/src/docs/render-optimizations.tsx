import { type QueryHandle, useQuery } from "@raf-query/react";
import { type ReactNode, use } from "react";
import type { Todo } from "~/api.ts";
import { postQuery } from "~/queries.ts";

declare const loaderData: { post: QueryHandle<typeof postQuery> };

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

function RefreshButton(props: { handle: QueryHandle<typeof postQuery> }) {
	const [, postState] = useQuery(postQuery, props.handle);
	return (
		<button disabled={postState.isFetching} onClick={() => postState.refetch()}>
			Refresh
		</button>
	);
}

function PostBody(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postThenable] = useQuery(postQuery, props.handle);
	const post = use(postThenable);
	return <article>{post.body}</article>;
}
// #endregion

declare const todosPromise: Promise<ReadonlyArray<Todo>>;

// #region deriving-in-render
const todos = use(todosPromise);
const done = todos.filter((todo) => todo.done);
// #endregion
