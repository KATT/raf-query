import {
	HydrationBoundary,
	load,
	prefetchEntry,
	type QueryHandle,
	useQuery,
} from "@raf-query/react";
import { dehydrate } from "@raf-query/react/hydration";
import { Suspense, use } from "react";

import type { PostComment } from "~/api.ts";
import { CommentsSkeleton } from "~/components/comments.tsx";
import { commentsQuery, postQuery } from "~/queries.ts";
import { queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/blog.$slug";

declare function Comment(props: { comment: PostComment }): React.ReactNode;
declare function PostSkeleton(): React.ReactNode;

// Homepage sample: both queries stream. `posts.$slug.tsx` keeps fetch +
// prefetch for the guide that teaches that split.

// #region hero
// #region loader
export async function loader(args: Route.LoaderArgs) {
	const qc = args.context.get(queryClientContext);
	const { slug } = args.params;
	// Never waits: both load while the page renders.
	const [handles] = await load(qc, {
		comments: prefetchEntry(commentsQuery, { slug }),
		post: prefetchEntry(postQuery, { slug }),
	});
	return { ...handles, dehydratedState: dehydrate(qc) };
}
// #endregion loader

// #region component
export default function PostPage(props: Route.ComponentProps) {
	const { comments, dehydratedState, post } = props.loaderData;
	return (
		<HydrationBoundary state={dehydratedState}>
			<article>
				<Suspense fallback={<PostSkeleton />}>
					<Post handle={post} />
				</Suspense>
				<Suspense fallback={<CommentsSkeleton />}>
					<PostComments handle={comments} />
				</Suspense>
			</article>
		</HydrationBoundary>
	);
}

function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postThenable] = useQuery(postQuery, props.handle);
	//     ^?
	const post = use(postThenable);
	return <h1>{post.title}</h1>;
}

// ---collapse---
function PostComments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pagesThenable] = useQuery(commentsQuery, props.handle);
	const pages = use(pagesThenable);
	return pages.pages
		.flatMap((page) => page.items)
		.map((comment) => <Comment key={comment.id} comment={comment} />);
}
// ---/collapse---
// #endregion component
// #endregion hero
