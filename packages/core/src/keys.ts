/**
 * Keys and invalidation targets. Everything that builds or matches a key
 * lives here, so the shape of grouping can change without touching the
 * cache.
 *
 * A key is a plain array, the same in memory, on the wire and in devtools.
 * `group()` builds them; a hand-written array works too.
 *
 * Core knows three kinds of target:
 *
 * - A factory, matched by identity, optionally with part of its input.
 *   The partial is matched against the input the factory was called with,
 *   never against the key, so it means the same however the key is built.
 * - A group, made by `group()`: a function that builds flat keys under its
 *   path, `drafts("byId", input)` is `["posts", "drafts", "byId", input]`.
 *   It matches every key that starts with its path, whoever built the key,
 *   so it covers its subgroups and their queries.
 * - Any object with `where(query, param)`, typed by the client's root
 *   `meta`: tags and one-off predicates. They read `meta`, never the key.
 *
 * Invalidation records a stamp per target. An entry is invalidated when a
 * matching stamp is newer than the request its data came from. Entries with
 * readers refetch at once; the rest are checked when they are next read,
 * which always goes through their factory, so `where` sees their `meta`.
 *
 * An entry that was only hydrated has no factory or input until it's read.
 * A factory target covers it from that first read: invalidation through its
 * stamp, which outlives the call. `resetMany` and `removeMany` act at once,
 * so a factory target skips such an entry; a group still reaches it by key.
 */

import { isString } from "./guards.ts";
import type { QueryMeta } from "./root.ts";

/** A query's key: a plain, serializable array. */
export type QueryKey = ReadonlyArray<unknown>;

declare const groupBrand: unique symbol;

/**
 * A named set of queries: those whose key starts with its path. Call it
 * for a key under that path; a subgroup's path extends its parent's, so a
 * group covers its subgroups and their queries.
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

function isPlainRecord(
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

/** Whether `actual` matches `expected`: equal, or for objects, every field `expected` has. */
function partialMatch(actual: unknown, expected: unknown): boolean {
	if (Object.is(actual, expected)) {
		return true;
	}
	if (Array.isArray(actual) && Array.isArray(expected)) {
		return (
			actual.length === expected.length &&
			expected.every((part, index) => partialMatch(actual[index], part))
		);
	}
	if (isPlainRecord(actual) && isPlainRecord(expected)) {
		return Object.keys(expected).every((name) =>
			partialMatch(actual[name], expected[name]),
		);
	}
	return false;
}

/** Any function that returns a query's options. */
export type AnyFactory = (input: never) => {
	readonly queryKey: QueryKey;
};

/** What a target's `where` sees of a query. */
export interface QueryInfo<TMeta = QueryMeta> {
	/** The query's data, before `select`; `undefined` without data. */
	readonly data: unknown;
	readonly input: unknown;
	/** The `meta` its factory gave it. An entry only hydrated has `{}` until it's read. */
	readonly meta: TMeta;
	readonly queryKey: QueryKey;
}

/**
 * Picks out queries by what they are: `where` gets each query and the
 * parameter the verb was called with.
 *
 * ```ts
 * const ownedBy: Target<AppMeta, Team> = { where: (query, team) => query.meta.owner === team };
 * await invalidateMany(client, ownedBy, "posts-team");
 * ```
 */
export interface Target<TMeta = QueryMeta, TParam = never> {
	readonly where: (query: QueryInfo<TMeta>, param: TParam) => boolean;
}

/** A target of any meta and parameter. */
export interface AnyTarget {
	readonly where: (query: never, param: never) => boolean;
}

/** The arguments after a target: its parameter, if it takes one. */
export type ParamArgs<TParam> = [TParam] extends [never]
	? []
	: unknown extends TParam
		? []
		: undefined extends TParam
			? [param?: TParam]
			: [param: TParam];

/** What matching needs from a cache entry. */
export interface Matchable {
	readonly factory: AnyFactory | undefined;
	readonly hash: string;
	readonly input: unknown;
	readonly key: QueryKey;
	readonly options: { readonly meta?: object } | undefined;
	readonly state: { readonly data: unknown };
}

/** One invalidation, by what it targets. */
export type Stamp =
	| { readonly at: number; readonly kind: "all" }
	| { readonly at: number; readonly hash: string; readonly kind: "entry" }
	| {
			readonly at: number;
			readonly factory: AnyFactory;
			readonly kind: "factory";
			readonly partial: unknown;
	  }
	| {
			readonly at: number;
			readonly kind: "group";
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly at: number;
			readonly kind: "target";
			readonly param: unknown;
			readonly target: AnyTarget;
	  };

/** Anything a verb can invalidate by. */
export type AnyInvalidation = AnyFactory | AnyTarget | Group;

/** A stamp for `target`. `arg` is a factory's partial input or a target's parameter. Tags are both callable and `where` targets. */
export function stampFor(
	target: AnyInvalidation,
	arg: unknown,
	at: number,
): Stamp {
	if ("where" in target) {
		return { at, kind: "target", param: arg, target };
	}
	return "path" in target
		? { at, kind: "group", path: target.path }
		: { at, factory: target, kind: "factory", partial: arg };
}

/** A stamp for exactly one entry. */
export function entryStamp(hash: string, at: number): Stamp {
	return { at, hash, kind: "entry" };
}

function infoOf(entry: Matchable): QueryInfo<object> {
	return {
		data: entry.state.data,
		input: entry.input,
		meta: entry.options?.meta ?? {},
		queryKey: entry.key,
	};
}

/** Whether a stamp's target covers an entry. */
export function matches(entry: Matchable, stamp: Stamp): boolean {
	switch (stamp.kind) {
		case "all":
			return true;
		case "entry":
			return entry.hash === stamp.hash;
		case "factory":
			return (
				entry.factory === stamp.factory &&
				(stamp.partial === undefined ||
					partialMatch(entry.input, stamp.partial))
			);
		case "group":
			return stamp.path.every((segment, i) => entry.key[i] === segment);
		case "target": {
			// SAFETY: the verb typed `param` and the meta against this target.
			const where = stamp.target.where as (
				query: QueryInfo<object>,
				param: unknown,
			) => boolean;
			return where(infoOf(entry), stamp.param);
		}
	}
}
