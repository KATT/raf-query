import {
	createQueryClient,
	invalidateMany,
	invalidateOne,
	queryOptions,
	recommended,
} from "@raf-query/react";
import { getPost, type Post } from "~/api.ts";
import { postQuery, posts } from "~/queries.ts";

declare const slug: string;

// #region tags
import { groups, tag } from "@raf-query/react/groups";

export const author = tag<string>("author");

export function makeQueryClient() {
	const { features, links } = recommended();
	return createQueryClient({ links, features: [...features, groups()] });
}

export function postBySlugQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
		meta: { tags: (post: Post) => [author(post.authorId)] },
	});
}

const qc = makeQueryClient();

await invalidateMany(qc, author, "ada"); // every query tagged with Ada
await invalidateMany(qc, author); // every query with an author tag
// #endregion

// #region intro
// One query: a factory and its input
await invalidateOne(qc, postQuery, { slug });

// Every query whose key starts with the `posts` group
await invalidateMany(qc, posts);
// #endregion

// #region matching-with-where
import type { QueryMeta, Target } from "@raf-query/react";

// Every query whose key mentions a todo id
const mentionsTodo: Target<QueryMeta, number> = {
	where: (query, id) => query.queryKey.includes(id),
};
await invalidateMany(qc, mentionsTodo, 5);

// Every query that has no data yet
await invalidateMany(qc, { where: (query) => query.data === undefined });
// #endregion
