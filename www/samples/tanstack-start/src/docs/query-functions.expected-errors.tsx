import {
	isFail,
	load,
	type QueryHandle,
	swr,
	useQuery,
} from "@raf-query/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { use } from "react";

import { postQuery } from "./query-functions.ts";

// #region loader
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		try {
			const [handles] = await load(args.context.queryClient, {
				post: swr(postQuery, { slug: args.params.slug }),
			});
			return handles;
		} catch (error) {
			if (isFail(error, "NotFound")) {
				throw notFound();
			}
			throw error;
		}
	},
});
// #endregion

// #region result
function Post(props: { handle: QueryHandle<typeof postQuery> }) {
	const [postThenable] = useQuery(postQuery, props.handle, { result: true });
	const post = use(postThenable);
	//    ^?
	if (!post.ok) {
		return <p>No post at {post.error.slug}.</p>;
	}
	return <h1>{post.value.title}</h1>;
}
// #endregion

export { Post };
