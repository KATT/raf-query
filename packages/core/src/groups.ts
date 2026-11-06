/**
 * Groups and tags: invalidation targets built on `where`, for apps that
 * want them. Core never imports this module, so apps that only invalidate
 * by factory don't ship it.
 *
 * Provisional (D9, round 2 "V3"), like the rest of the keys design.
 */

import { type Feature, feature } from "./client.ts";
import { isFunction, isObject } from "./guards.ts";
import type { ParamArgs, QueryInfo, Target } from "./keys.ts";
import type { MetaOfDecl } from "./root.ts";

/**
 * A named set of queries: those whose key starts with it, or with one of
 * its subgroups. Matching goes by name path, so keys that went through
 * hydration (copies of the group) still match.
 */
export interface Group extends Target<unknown> {
	readonly group: string;
	readonly in?: Group;
	readonly where: (query: QueryInfo<unknown>) => boolean;
}

function pathOf(segment: unknown): string | undefined {
	if (!isObject(segment) || !("group" in segment)) {
		return undefined;
	}
	const name = segment.group;
	const parent = "in" in segment ? pathOf(segment.in) : undefined;
	return parent === undefined ? String(name) : `${parent}/${String(name)}`;
}

/**
 * A group, optionally inside a parent. Put it first in a query's key:
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
	const self: Group = {
		group: name,
		in: parent,
		where: (query) => {
			const path = pathOf(query.queryKey[0]);
			const own = pathOf(self);
			return path === own || (path?.startsWith(`${own}/`) ?? false);
		},
	};
	return self;
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
