import {
	createQueryClient,
	HydrationBoundary,
	load,
	prefetch,
	swr,
} from "@raf-query/react";
import { Suspense } from "react";

import { Author } from "./author.tsx";
import { Comments } from "./comments.tsx";
import { Post } from "./post.tsx";
import { Providers } from "./providers.tsx";
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
				<Providers>
					<HydrationBoundary client={qc}>
						<Post handle={handles.post} />
						<Suspense fallback={<p>Loading comments…</p>}>
							<Comments handle={handles.comments} />
						</Suspense>
						<Suspense fallback={<p>Loading author…</p>}>
							<Author slug="hello" />
						</Suspense>
					</HydrationBoundary>
				</Providers>
			</body>
		</html>
	);
}
