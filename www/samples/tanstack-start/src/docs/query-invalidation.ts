import {
	createQueryClient,
	invalidateMany,
	invalidateOne,
	queryOptions,
	recommended,
} from "@raf-query/react";
import { getPost } from "~/api.ts";
import { authors, postQuery, posts, postsQuery } from "~/queries.ts";

declare const slug: string;

// #region tags
import { feature } from "@raf-query/react";

// Declares `meta.tags` on the clients that have it
const tagged = feature<{ meta: { tags?: ReadonlyArray<string> } }>();

type Tagged = { readonly tags: ReadonlyArray<string> | undefined };

// Every query that lists the tag
const tag = (name: string): Target<Tagged> => ({
	where: (query) => query.meta.tags?.includes(name) ?? false,
});

export function makeQueryClient() {
	const { features, links } = recommended();
	return createQueryClient({ links, features: [...features, tagged] });
}

export function postBySlugQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
		meta: { tags: ["content", `post:${input.slug}`] },
	});
}

const qc = makeQueryClient();

await invalidateMany(qc, tag("content"));
// #endregion

// #region tags-param
// One target for every tag: the tag is its parameter
const tags: Target<Tagged, string> = {
	where: (query, name) => query.meta.tags?.includes(name) ?? false,
};

await invalidateMany(qc, tags, `post:${slug}`);
// #endregion

// #region intro
// One query: a factory and its input
await invalidateOne(qc, postQuery, { slug });

// Every query whose key starts with the `posts` group
await invalidateMany(qc, posts);
// #endregion

// #region several-targets
// One call: the refetches run side by side, and a query that two targets
// cover refetches once
await invalidateMany(qc, [
	authors, // a group
	postQuery, // a factory: all its queries
	[postsQuery, { sort: "newest" }], // a factory with a partial input
	[tags, `post:${slug}`], // a target with its parameter
]);
// #endregion

// #region matching-with-where
import type { QueryMeta, Target } from "@raf-query/react";

// Every query whose key mentions a post's slug
const mentionsPost: Target<QueryMeta, string> = {
	where: (query, postSlug) => query.queryKey.includes(postSlug),
};
await invalidateMany(qc, mentionsPost, slug);

// Every query that has no data yet
await invalidateMany(qc, { where: (query) => query.data === undefined });
// #endregion
