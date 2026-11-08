import {
	createQueryClient,
	group,
	infiniteQueryOptions,
	invalidateMany,
	queryOptions,
} from "@raf-query/react";
import { getPost, listPostPage, listPosts } from "~/api.ts";

declare function getSpecial(): Promise<unknown>;

// #region groups
export const posts = group("posts");
export const drafts = group(posts, "drafts");

const key = drafts("list");
//    ^?
drafts.path;
//     ^?
// #endregion

// #region simple-keys
const settings = group("settings");

// A list of posts
infiniteQueryOptions({
	queryKey: posts("list"),
	queryFn: (context) => listPostPage({ cursor: context.pageParam }),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});

// Something else, whatever!
queryOptions({
	queryKey: settings(),
	queryFn: () => getSpecial(),
});
// #endregion

declare function queryFn(): Promise<unknown>;

// #region keys-with-variables
// An individual post
queryOptions({
	queryKey: posts("bySlug", "hello-world"),
	queryFn: () => getPost("hello-world"),
});

// An individual post in a "preview" format
queryOptions({
	queryKey: posts("bySlug", "hello-world", { preview: true }),
	queryFn,
});

// A list of one author's drafts
infiniteQueryOptions({
	queryKey: drafts("list", { authorId: "ada" }),
	queryFn: (context) =>
		listPostPage({ authorId: "ada", cursor: context.pageParam, drafts: true }),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});
// #endregion

declare const sort: string;

declare const page: number;

// #region keys-are-hashed-deterministically
posts("list", { sort, page });
posts("list", { page, sort });
posts("list", { page, sort, other: undefined });
// #endregion

// #region array-order-matters
posts("list", sort, page);
posts("list", page, sort);
posts("list", undefined, page, sort);
// #endregion

// #region put-the-input-in-the-key
export function postListQuery(input: {
	sort: "newest" | "oldest";
	page: number;
}) {
	return queryOptions({
		queryKey: posts("list", input),
		queryFn: () => listPosts(input),
	});
}
// #endregion

const qc = createQueryClient();

// #region design-keys-for-invalidation
await invalidateMany(qc, posts); // every post query, drafts too
await invalidateMany(qc, drafts); // only drafts
await invalidateMany(qc, postListQuery); // every page of every list
await invalidateMany(qc, postListQuery, { sort: "newest" }); // the newest-first lists
// #endregion

// #region hand-written-keys
export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["posts", "bySlug", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

await invalidateMany(qc, posts); // covers it: its key starts with ["posts"]
// #endregion
