/**
 * Keys and invalidation targets. Everything that builds or matches a key
 * lives here, so the shape of grouping can change without touching the
 * cache.
 *
 * Core knows three kinds of target:
 *
 * - A factory, matched by identity, optionally with part of its input.
 * - A group, made by `group()` in `@raf-query/core/groups`: a function that
 *   builds flat keys under its path, `drafts("byId", input)` is
 *   `["posts", "drafts", "byId", input]`. It matches every key that starts
 *   with its path, so it covers its subgroups and their queries. Keys are
 *   plain arrays, the same in memory, on the wire and in devtools.
 * - Any object with `where(query, param)`, typed by the client's root
 *   `meta`: tags and one-off predicates. They read `meta`, never the key.
 *
 * Invalidation records a stamp per target. An entry is invalidated when a
 * matching stamp is newer than the request its data came from. Entries with
 * readers refetch at once; the rest are checked when they are next read,
 * which always goes through their factory, so `where` sees their `meta`.
 */

import type { QueryMeta } from "./root.ts";

/** A key as handles and hydration carry it. Plain and serializable. */
export type QueryKey = ReadonlyArray<unknown>;

declare const groupKeyBrand: unique symbol;

/**
 * A key a group built: a plain array at runtime. The brand is a type only,
 * so `queryOptions` takes no hand-written or spread key.
 */
export type GroupKey<
	TKey extends QueryKey = QueryKey,
	TPath extends ReadonlyArray<string> = ReadonlyArray<string>,
> = TKey & {
	readonly [groupKeyBrand]: { readonly key: TKey; readonly path: TPath };
};

/** A key's plain tuple, without its brand. */
export type KeyTuple<TKey> = TKey extends {
	readonly [groupKeyBrand]: { readonly key: infer TTuple };
}
	? TTuple
	: TKey;

/** A query's key, as `queryOptions` takes it: built by a group. */
export type QueryKeyOption = GroupKey;

declare const groupBrand: unique symbol;

/**
 * A named set of queries: those whose key starts with its path. Call it
 * for a key under that path; a subgroup's path extends its parent's, so a
 * group covers its subgroups and their queries.
 */
export interface Group<
	TPath extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
	<const TRest extends QueryKey>(
		...rest: TRest
	): GroupKey<readonly [...TPath, ...TRest], TPath>;
	readonly [groupBrand]: TPath;
	/** Its parents' names and its own. */
	readonly path: TPath;
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
	readonly queryKey: QueryKeyOption;
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
					partialMatch(entry.key.at(-1), stamp.partial))
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
