import { use } from "react";
import { type QueryHandle, useIsFetching, useQuery } from "@raf-query/react";
import type { ReactNode } from "react";
import { commentsQuery, postQuery } from "~/queries.ts";

declare function Spinner(props: { readonly label: string }): ReactNode;

// #region one-query-isfetching
function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postThenable, controls] = useQuery(postQuery, props.handle);
	const post = use(postThenable);
	return (
		<article aria-busy={controls.isFetching}>
			<h1>
				{post.title}
				{controls.isFetching ? <Spinner label="Refreshing" /> : null}
			</h1>
			<p>{post.body}</p>
		</article>
	);
}
// #endregion

declare function ProgressBar(): ReactNode;

// #region useisfetching
function GlobalProgress() {
	const fetching = useIsFetching();
	return fetching > 0 ? <ProgressBar /> : null;
}
// #endregion

// #region counting-some-queries
const loadingComments = useIsFetching(commentsQuery);
// #endregion
