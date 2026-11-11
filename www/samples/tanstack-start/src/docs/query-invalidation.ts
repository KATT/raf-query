import {
	createQueryClient,
	invalidateMany,
	invalidateOne,
	recommended,
} from "@raf-query/react";
import { getPost } from "~/api.ts";
import { authors, postQuery, posts, postsQuery } from "~/queries.ts";

declare const slug: string;

// #region tags
import { bindQueryOptions, plugin } from "@raf-query/react";

interface Tags {
	readonly options: { readonly tags?: ReadonlyArray<string> };
}

// Declares the `tags` option on the clients that have it
const tagged = plugin<Tags>();

export function makeQueryClient() {
	return createQueryClient({ plugins: [...recommended(), tagged] });
}

// In the app's `raf.ts`
const queryOptions = bindQueryOptions<typeof makeQueryClient>();

export function postBySlugQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
		tags: ["content", `post:${input.slug}`],
	});
}

// The option the way a client with `tagged` has it
type Tagged = { readonly tags: ReadonlyArray<string> | undefined };

// Every query that lists the tag
const tag = (name: string): Target<Tagged> => ({
	where: (query) => query.options.tags?.includes(name) ?? false,
});

const qc = makeQueryClient();

await invalidateMany(qc, tag("content"));
// #endregion

// #region tags-param
// One target for every tag: the tag is its parameter
const tags: Target<Tagged, string> = {
	where: (query, name) => query.options.tags?.includes(name) ?? false,
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
import type { Target } from "@raf-query/react";

// Every query whose key mentions a post's slug
const mentionsPost: Target<object, string> = {
	where: (query, postSlug) => query.queryKey.includes(postSlug),
};
await invalidateMany(qc, mentionsPost, slug);

// Every query that has no data yet
await invalidateMany(qc, { where: (query) => query.data === undefined });
// #endregion
