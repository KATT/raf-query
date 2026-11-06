/**
 * Groups and tags, for apps that want them. Core matches groups (plain
 * data) by key; tags are `where` targets that read `meta.tags`. Core never
 * imports this module, so apps that only invalidate by factory don't ship
 * it.
 */

import { type Feature, feature } from "./client.ts";
import { isFunction } from "./guards.ts";
import type { Group, ParamArgs, QueryInfo, Target } from "./keys.ts";
import type { MetaOfDecl } from "./root.ts";

export type { Group } from "./keys.ts";

/**
 * A group, optionally inside a parent: `{ group: "posts/drafts" }`, frozen.
 * Put it first in a query's key; invalidating a group covers the groups
 * inside it.
 *
 * ```ts
 * export const posts = group("posts");
 * export const drafts = group("drafts", posts);
 * const draftById = (input: { id: string }) =>
 *   queryOptions({ queryKey: [drafts, "byId", input], queryFn });
 * await invalidateMany(client, posts); // drafts too
 * ```
 */
export function group(name: string, parent?: Group): Group {
	const path = parent === undefined ? name : `${parent.group}/${name}`;
	// SAFETY: the brand is a type only.
	return Object.freeze({ group: path }) as Group;
}

/** What `groups()` adds to a query's `meta`: its tags, fixed or derived from its data. */
export interface TagsMeta {
	readonly tags?:
		| ReadonlyArray<string>
		| ((data: never) => ReadonlyArray<string>);
}

type TagsDecl = { readonly meta: TagsMeta };

/**
 * The feature that gives a root's queries `meta.tags`. Tags only match on
 * the clients of roots that have it; groups match on any root.
 *
 * ```ts
 * createQueryClient({ features: [groups()] });
 * ```
 */
export function groups(): Feature<TagsDecl> {
	return feature<TagsDecl>();
}

/**
 * A typed tag. Call it for the tag string a query lists in `meta.tags`;
 * pass it to a verb to invalidate queries with that tag, for one
 * parameter or (without one) for all of them.
 */
export interface Tag<TParam = never> extends Target<
	MetaOfDecl<TagsDecl>,
	TParam | undefined
> {
	(...param: ParamArgs<TParam>): string;
	readonly tag: string;
}

function tagsOf(query: QueryInfo<MetaOfDecl<TagsDecl>>): ReadonlyArray<string> {
	const tags = query.meta.tags;
	if (!isFunction(tags)) {
		return tags ?? [];
	}
	if (query.data === undefined) {
		return [];
	}
	return tags(
		// SAFETY: `tags` takes the data of the query that declared it.
		query.data as never,
	);
}

/**
 * A tag, optionally with a typed parameter.
 *
 * ```ts
 * export const author = tag<string>("author");
 * queryOptions({ queryKey, queryFn, meta: { tags: [author(input.authorId)] } });
 * await invalidateMany(client, author, "ada"); // or every author: invalidateMany(client, author)
 * ```
 */
export function tag<TParam = never>(name: string): Tag<TParam> {
	const make = (...param: ReadonlyArray<unknown>) =>
		param[0] === undefined ? name : `${name}:${JSON.stringify(param[0])}`;
	return Object.assign(make, {
		tag: name,
		where: (
			query: QueryInfo<MetaOfDecl<TagsDecl>>,
			param: TParam | undefined,
		) => {
			const tags = tagsOf(query);
			return param === undefined
				? tags.some((one) => one === name || one.startsWith(`${name}:`))
				: tags.includes(make(param));
		},
	});
}
