/**
 * Keys: plain arrays, the same in memory, on the wire and in devtools.
 * `group()` builds them; a hand-written array works too. Every key is
 * hashed to one stable string, the entry's identity in the cache.
 *
 * Keys and targets (`./targets.ts`) are the seam for grouping: everything
 * that builds or matches a key lives in this folder, so the shape of
 * grouping can change without touching the cache.
 */

import { isString } from "../guards.ts";

/**
 * A query's key: a plain, serializable array.
 *
 * @see https://raf-query.katt.dev/docs/query-keys
 */
export type QueryKey = ReadonlyArray<unknown>;

declare const groupBrand: unique symbol;

/**
 * A named set of queries: those whose key starts with its path. Call it
 * for a key under that path; a subgroup's path extends its parent's, so a
 * group covers its subgroups and their queries.
 *
 * @see https://raf-query.katt.dev/docs/query-keys#groups
 */
export interface Group<
	TPath extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
	<const TRest extends QueryKey>(...rest: TRest): readonly [...TPath, ...TRest];
	readonly [groupBrand]: TPath;
	/** Its parents' names and its own. */
	readonly path: TPath;
}

/** Bundlers replace `process.env.NODE_ENV`; typed here so consumers need no Node types. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

let namesUnder: WeakMap<Group, Map<string, "group" | "query">> | undefined;

/**
 * A subgroup and a query with one name under one parent would share a key
 * prefix, so invalidating the subgroup would reach the query. Development
 * builds throw at whichever comes second. Only keys `group()` builds are
 * checked.
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
 *
 * @see https://raf-query.katt.dev/docs/query-keys#groups
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
	// SAFETY: the brand is a type only; `self` builds the keys `Group` describes.
	const built = Object.assign(self, {
		path: Object.freeze(path),
	}) as never as Group;
	if (process.env.NODE_ENV !== "production" && !isString(first)) {
		claim(first, name, "group");
	}
	return built;
}

export function isPlainRecord(
	value: unknown,
): value is { readonly [name: string]: unknown } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function sortFields(_name: string, value: unknown) {
	if (!isPlainRecord(value)) {
		return value;
	}
	const sorted: Record<string, unknown> = {};
	for (const name of Object.keys(value).toSorted()) {
		sorted[name] = value[name];
	}
	return sorted;
}

/** Stable string form of a key: JSON with sorted fields. Functions drop out. */
export function hashKey(key: QueryKey): string {
	return JSON.stringify(key, sortFields);
}

/** Any function that returns a query's options. */
export type AnyFactory = (input: never) => {
	readonly queryKey: QueryKey;
};
