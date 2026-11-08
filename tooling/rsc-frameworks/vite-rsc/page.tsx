import {
	createQueryClient,
	HydrationBoundary,
	load,
	prefetch,
	QueryProvider,
	swr,
} from "@raf-query/react";
import { Suspense } from "react";

import { Comments } from "./comments.tsx";
import { Post } from "./post.tsx";
import { commentsQuery, postQuery, queryClientConfig } from "./queries.ts";

/** The docs' Next.js page and root layout, as one server component. */
export async function Page() {
	const qc = createQueryClient(queryClientConfig);
	const [handles] = await load(qc, {
		comments: prefetch(commentsQuery, { slug: "hello" }),
		post: swr(postQuery, { slug: "hello" }),
	});
	return (
		<html lang="en">
			<body>
				<QueryProvider config={queryClientConfig}>
					<HydrationBoundary client={qc}>
						<Post handle={handles.post} />
						<Suspense fallback={<p>Loading comments…</p>}>
							<Comments handle={handles.comments} />
						</Suspense>
					</HydrationBoundary>
				</QueryProvider>
			</body>
		</html>
	);
}
