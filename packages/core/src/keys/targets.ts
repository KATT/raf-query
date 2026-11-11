/**
 * Invalidation targets, and how a stamp matches an entry.
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
 * - Any object with `where(query, param)`, typed by the options the
 *   client's plugins declare: predicates over a query's key, input, options
 *   or data. Tags are one, written in user code over a `tags` option a
 *   plugin declares.
 *
 * Invalidation records a stamp per target. An entry is invalidated when a
 * matching stamp is newer than the request its data came from. Entries with
 * readers refetch at once; the rest are checked when they are next read,
 * which always goes through their factory, so `where` sees their options.
 *
 * An entry that was only hydrated has no factory or input until it's read.
 * A factory target covers it from that first read: invalidation through its
 * stamp, which outlives the call. `resetMany` and `removeMany` act at once,
 * so a factory target skips such an entry; a group still reaches it by key.
 */

import {
	type AnyFactory,
	type Group,
	isPlainRecord,
	type QueryKey,
} from "./keys.ts";

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

/**
 * What a target's `where` sees of a query.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#matching-with-where
 */
export interface QueryInfo<TOptions = object> {
	/** The query's data, before `select`; `undefined` without data. */
	readonly data: unknown;
	readonly input: unknown;
	/** The options its factory gave it. An entry only hydrated has `{}` until it's read. */
	readonly options: TOptions;
	readonly queryKey: QueryKey;
}

/**
 * Picks out queries by what they are: `where` gets each query and the
 * parameter the verb was called with.
 *
 * ```ts
 * const ownedBy: Target<RootOf<Ownership>["options"], Team> = { where: (query, team) => query.options.owner === team };
 * await invalidateMany(client, ownedBy, "editorial");
 * ```
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#targets
 */
export interface Target<TOptions = object, TParam = never> {
	readonly where: (query: QueryInfo<TOptions>, param: TParam) => boolean;
}

/** A target of any options and parameter. */
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
	readonly options: object | undefined;
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

/** A stamp for `target`. `arg` is a factory's partial input or a target's parameter. A `where` target may be callable too, so `where` is checked first. */
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
		options: entry.options ?? {},
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
			// SAFETY: the verb typed `param` and the options against this target.
			const where = stamp.target.where as (
				query: QueryInfo<object>,
				param: unknown,
			) => boolean;
			return where(infoOf(entry), stamp.param);
		}
	}
}
