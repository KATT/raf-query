---
title: Home, step 2
description: The homepage's route loader
section: Project
order: 0
---

```tsx twoslash title="src/routes/posts.$slug.tsx"
import { commentsQuery, createFileRoute, postQuery } from "./_twoslash.ts";
declare function PostPage(): null;
// ---cut---
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		// Never waits: the comments load while the page renders.
		const comments = qc.prefetch(commentsQuery, { slug });
		// Waits only if the post isn't in the cache yet.
		const post = await qc.ensure(postQuery, { slug });
		return { comments, post };
	},
	component: PostPage,
});
```
