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
		const input = { slug: args.params.slug };
		const comments = qc.prefetch(commentsQuery, input);
		const post = await qc.ensure(postQuery, input);
		return { comments, post };
	},
	component: PostPage,
});
// ---cut---
function PostPage() {
	const data = Route.useLoaderData();
	// The route waited for this one, so it's the post itself.
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
	// Still on its way: use() suspends until the first page lands.
	const [pages] = useQuery(commentsQuery, props.handle);
	//     ^?
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
}
```
