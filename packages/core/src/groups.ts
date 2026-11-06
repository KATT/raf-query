/**
 * Groups and tags. Every query key comes from a group; core matches a
 * group by its path, a prefix of the key. Tags are `where` targets that
 * read `meta.tags`.
 */

import { type Feature, feature } from "./client.ts";
import { isFunction, isString } from "./guards.ts";
import type { Group, ParamArgs, QueryInfo, Target } from "./keys.ts";
import type { MetaOfDecl } from "./root.ts";

export type { Group, GroupKey } from "./keys.ts";

/** Bundlers replace `process.env.NODE_ENV`; typed here so consumers need no Node types. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

let namesUnder: WeakMap<Group, Map<string, "group" | "query">> | undefined;

/**
 * A subgroup and a query with one name under one parent would share a key
 * prefix, so invalidating the subgroup would reach the query. Development
 * builds throw at whichever comes second.
 */
function claim(parent: Group, name: unknown, kind: "group" | "query") {
	if (!isString(name)) {
		return;
	}
	namesUnder ??= new WeakMap();
	const names = namesUnder.get(parent) ?? new Map<string, "group" | "query">();
	namesUnder.set(parent, names);
	if ((names.get(name) ?? kind) !== kind) {
		throw new Error(
			`raf-query: "${[...parent.path, name].join("/")}" is both a subgroup and a query key. Give one of them another name.`,
		);
	}
	names.set(name, kind);
}

/**
 * A group, or a subgroup inside `parent`. Call it for a query's key: a
 * flat, plain array that starts with the group's path. Invalidating a group
 * covers its subgroups and every query below them.
 *
 * ```ts
 * export const posts = group("posts");
 * export const drafts = group(posts, "drafts");
 * const draftById = (input: { id: string }) =>
 *   queryOptions({ queryKey: drafts("byId", input), queryFn }); // ["posts", "drafts", "byId", input]
 * await invalidateMany(client, posts); // drafts too
 * ```
 */
export function group<const TName extends string>(
	name: TName,
): Group<readonly [TName]>;
export function group<
	const TPath extends ReadonlyArray<string>,
	const TName extends string,
>(parent: Group<TPath>, name: TName): Group<readonly [...TPath, TName]>;
export function group(first: Group | string, name?: string): Group {
	const path = isString(first) ? [first] : [...first.path, name];
	const self = (...rest: ReadonlyArray<unknown>) => {
		if (process.env.NODE_ENV !== "production") {
			claim(built, rest[0], "query");
		}
		return [...path, ...rest];
	};
	// SAFETY: the brands are types only; `self` builds the keys they describe.
	const built = Object.assign(self, {
		path: Object.freeze(path),
	}) as never as Group;
	if (process.env.NODE_ENV !== "production" && !isString(first)) {
		claim(first, name, "group");
	}
	return built;
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
