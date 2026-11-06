/**
 * Keys and invalidation targets. Everything that builds or matches a key
 * lives here, so the shape of grouping can change without touching the
 * cache.
 *
 * Provisional (D9, round 2 "V3"): core knows three kinds of target, which
 * Alex hasn't confirmed yet.
 *
 * - A factory, matched by identity, optionally with part of its input.
 * - A group: plain data, `{ group: "posts/drafts" }`, made by `group()` in
 *   `@raf-query/core/groups`. It matches keys whose first segment is that
 *   group or one inside it, so keys look the same in memory, on the wire
 *   and in devtools.
 * - Any object with `where(query, param)`, typed by the client's root
 *   `meta`: tags and one-off predicates. They read `meta`, never the key.
 *
 * Invalidation records a stamp per target. An entry is invalidated when a
 * matching stamp is newer than the request its data came from. Entries with
 * readers refetch at once; the rest are checked when they are next read,
 * which always goes through their factory, so `where` sees their `meta`.
 */

import { isString } from "./guards.ts";
import type { QueryMeta } from "./root.ts";

/** A query's key. Any serializable array. */
export type QueryKeyOption = ReadonlyArray<unknown>;

/** A key as handles and hydration carry it. Plain and serializable. */
export type QueryKey = QueryKeyOption;

declare const groupBrand: unique symbol;

/**
 * A named set of queries: those whose key starts with it or with a group
 * inside it. Plain data at runtime (`{ group: "posts/drafts" }`); the brand
 * is in the types only, so verbs take groups from `group()`, never a
 * hand-written object.
 */
export interface Group {
	/** The group's path: its parents' names and its own, joined by `/`. */
	readonly group: string;
	readonly [groupBrand]: true;
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
 * const ownedBy = { where: (query: QueryInfo<AppMeta>, team: Team) => query.meta.owner === team };
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
	| { readonly at: number; readonly group: string; readonly kind: "group" }
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
	return "group" in target
		? { at, group: target.group, kind: "group" }
		: { at, factory: target, kind: "factory", partial: arg };
}

function groupOf(segment: unknown): string | undefined {
	return isPlainRecord(segment) && isString(segment.group)
		? segment.group
		: undefined;
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
		case "group": {
			const own = groupOf(entry.key[0]);
			return own !== undefined && `${own}/`.startsWith(`${stamp.group}/`);
		}
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
