/**
 * Groups, tags, keys and invalidation targets. Everything that builds or
 * matches a key lives here, so the shape of groups and tags can change
 * without touching the cache.
 *
 * Provisional (D9, D9b, D9c): this follows Design 1 and tags T1 of the
 * keys/groups/tags design, which Alex hasn't confirmed yet.
 *
 * - Groups and tags are plain object literals, so modules of factories
 *   tree-shake as plain code in every bundler.
 * - A key starts with its group object: `[drafts, "byId", input]`.
 * - Invalidation is by identity: each one records a stamp per target (a
 *   group path, a tag, a factory function or one entry). An entry is
 *   invalidated when a matching stamp is newer than the request its data
 *   came from. Entries with readers refetch at once; the rest are checked
 *   when they are next read, which always goes through their factory.
 */

/** A named set of queries. `in` nests it in a parent group. */
export interface Group {
	readonly group: string;
	readonly in?: Group;
}

/** A tag definition. `key` types (and normalizes) the tag's parameter. */
export interface TagDef<TParam = never> {
	readonly key?: (param: TParam) => unknown;
	readonly tag: string;
}

declare const tagBrand: unique symbol;

/** A tag a query carries, from {@link tagged}. Never a bare string. */
export type Tag = string & { readonly [tagBrand]: true };

export type ParamOf<TDef> = TDef extends {
	readonly key: (param: infer TParam) => unknown;
}
	? TParam
	: never;

/**
 * The tag for a definition and its parameter, for a query's `tags`:
 *
 * ```ts
 * export const author = { tag: "author", key: (id: string) => id };
 * tags: [tagged(author, input.authorId)],
 * ```
 */
export function tagged(def: {
	readonly key?: undefined;
	readonly tag: string;
}): Tag;
export function tagged<TDef extends TagDef<never>>(
	def: TDef,
	param: ParamOf<TDef>,
): Tag;
export function tagged(def: TagDef<unknown>, param?: unknown): Tag {
	const name =
		param === undefined
			? def.tag
			: `${def.tag}:${JSON.stringify(def.key ? def.key(param) : param)}`;
	// SAFETY: the brand only exists in types; this is the one place tags are made.
	return name as Tag;
}

/** A query's key: its group object, then names and input. */
export type QueryKeyOption = readonly [Group, string, ...Array<unknown>];

/** A key as handles and hydration carry it. Plain and serializable. */
export type QueryKey = QueryKeyOption;

export function pathOf(group: Group): string {
	return group.in ? `${pathOf(group.in)}/${group.group}` : group.group;
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

/** Stable string form of a key: the group's path, then the rest with sorted fields. */
export function hashKey(key: QueryKey): string {
	return JSON.stringify([pathOf(key[0]), ...key.slice(1)], sortFields);
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

/**
 * The tags an entry carries: each tag, and for a parameterized one also its
 * bare name, so `invalidateMany(author)` reaches `author:"a"`.
 */
export function expandTags(tags: ReadonlyArray<Tag>): ReadonlyArray<string> {
	const all = new Set<string>();
	for (const tag of tags) {
		all.add(tag);
		const colon = tag.indexOf(":");
		if (colon > 0) {
			all.add(tag.slice(0, colon));
		}
	}
	return [...all];
}

/** Any function that returns a query's options. */
export type AnyFactory = (input: never) => {
	readonly queryKey: QueryKeyOption;
};

/** What picks out queries: a group, a tag definition, or a factory. */
export type Target = AnyFactory | Group | TagDef<never>;

/** What matching needs from a cache entry. */
export interface Matchable {
	readonly factory: AnyFactory | undefined;
	readonly hash: string;
	readonly key: QueryKey;
	readonly tags: ReadonlyArray<string>;
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
	| { readonly at: number; readonly kind: "group"; readonly path: string }
	| { readonly at: number; readonly kind: "tag"; readonly tag: string };

function isFactory(target: Target): target is AnyFactory {
	return typeof target === "function";
}

function isTagDef(target: Group | TagDef<never>): target is TagDef<never> {
	return "tag" in target;
}

/** A stamp for `target`. `arg` is a factory's partial input or a tag's parameter. */
export function stampFor(target: Target, arg: unknown, at: number): Stamp {
	if (isFactory(target)) {
		return { at, factory: target, kind: "factory", partial: arg };
	}
	if (isTagDef(target)) {
		const tag =
			arg === undefined
				? target.tag
				: tagged(target, /* SAFETY: typed at the verb. */ arg as never);
		return { at, kind: "tag", tag };
	}
	return { at, kind: "group", path: pathOf(target) };
}

/** A stamp for exactly one entry. */
export function entryStamp(hash: string, at: number): Stamp {
	return { at, hash, kind: "entry" };
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
			const path = pathOf(entry.key[0]);
			return path === stamp.path || path.startsWith(`${stamp.path}/`);
		}
		case "tag":
			return entry.tags.includes(stamp.tag);
	}
}
