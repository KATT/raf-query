import {
	getData,
	invalidateMany,
	type QueryClient,
	setData,
} from "@raf-query/react";
import { updatePost } from "~/api.ts";
import { authors, feedQuery, postQuery, postsQuery } from "~/queries.ts";

declare const queryClient: QueryClient;

declare const slug: string;

declare const title: string;

// #region several-targets
await updatePost({ slug, title });
await invalidateMany(queryClient, [
	[postQuery, { slug }], // this post
	postsQuery, // every post list
	authors, // and the authors' post counts
]);
// #endregion

// #region optimistic-updates-in-the-cache
async function renamePost(
	queryClient: QueryClient,
	input: { slug: string; title: string },
) {
	const previous = getData(queryClient, feedQuery);
	setData(queryClient, feedQuery, (data) => ({
		pageParams: data?.pageParams ?? [],
		// Patch the post in whichever page holds it.
		pages: (data?.pages ?? []).map((page) => ({
			...page,
			items: page.items.map((post) =>
				post.slug === input.slug ? { ...post, title: input.title } : post,
			),
		})),
	}));
	try {
		await updatePost(input);
	} catch (error) {
		setData(queryClient, feedQuery, previous ?? { pageParams: [], pages: [] });
		throw error;
	} finally {
		await invalidateMany(queryClient, feedQuery);
	}
}
// #endregion

// #region updates-from-mutation-responses
const updated = await updatePost({ slug, title });
setData(queryClient, postQuery, { slug }, updated);
// #endregion
