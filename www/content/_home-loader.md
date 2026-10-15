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
		const input = { slug: args.params.slug };
		// Starts the request and moves on.
		const comments = qc.prefetch(commentsQuery, input);
		// Starts the request, and the route change waits for it.
		const post = await qc.ensure(postQuery, input);
		return { comments, post };
	},
	component: PostPage,
});
```
