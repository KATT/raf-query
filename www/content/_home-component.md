---
title: Home, step 3
description: The homepage's components
section: Project
order: 0
---

```tsx twoslash title="src/routes/posts.$slug.tsx"
import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";
import {
	commentsQuery,
	createFileRoute,
	type PostComment,
	postQuery,
} from "./_twoslash.ts";
declare function CommentsSkeleton(): React.ReactNode;
declare function renderComment(comment: PostComment): React.ReactNode;
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		const comments = qc.prefetch(commentsQuery, { slug });
		const post = await qc.ensure(postQuery, { slug });
		return { comments, post };
	},
	component: PostPage,
});
// ---cut---
function PostPage() {
	const data = Route.useLoaderData();
	// ensure put the post in the cache, so this is the post itself.
	const [post] = useQuery(postQuery, data.post);
	//     ^?
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	// May still be loading. If so, use() suspends until it lands.
	const [pages] = useQuery(commentsQuery, props.handle);
	//     ^?
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
}
```
