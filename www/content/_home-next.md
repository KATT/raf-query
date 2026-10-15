---
title: Home (Next.js)
description: Code samples on the home page, Next.js App Router
section: Project
order: 0
---

```tsx twoslash title="src/app/posts/[slug]/page.tsx"
import { HydrationBoundary } from "@raf-query/react/rsc";
import { commentsQuery, postQuery } from "./_twoslash.ts";
declare function getQueryClient(): import("@raf-query/react").QueryClient;
declare function PostPage(props: {
	comments: import("@raf-query/react").QueryHandle<typeof commentsQuery>;
	post: import("@raf-query/react").QueryHandle<typeof postQuery>;
}): null;
// ---cut---
export default async function Page(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const qc = getQueryClient();
	// Start both. The page streams at once; client components suspend.
	const comments = qc.prefetch(commentsQuery, { slug });
	const post = qc.prefetch(postQuery, { slug });
	return (
		<HydrationBoundary client={qc}>
			<PostPage comments={comments} post={post} />
		</HydrationBoundary>
	);
}
```

```tsx twoslash title="src/components/post-page.tsx"
import { type QueryHandle, useQuery } from "@raf-query/react";
import { Suspense, use } from "react";
import { commentsQuery, type PostComment, postQuery } from "./_twoslash.ts";
declare function CommentsSkeleton(): React.ReactNode;
declare function PostSkeleton(): React.ReactNode;
declare function renderComment(comment: PostComment): React.ReactNode;
// ---cut---
("use client");

export function PostPage(props: {
	comments: QueryHandle<typeof commentsQuery>;
	post: QueryHandle<typeof postQuery>;
}) {
	return (
		<article>
			<Suspense fallback={<PostSkeleton />}>
				<PostTitle handle={props.post} />
			</Suspense>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={props.comments} />
			</Suspense>
		</article>
	);
}

function PostTitle(props: { handle: QueryHandle<typeof postQuery> }) {
	const [post] = useQuery(postQuery, props.handle);
	//     ^?
	return <h1>{use(post).title}</h1>;
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pages] = useQuery(commentsQuery, props.handle);
	//     ^?
	return use(pages)
		.pages.flatMap((page) => page.items)
		.map(renderComment);
}
```
