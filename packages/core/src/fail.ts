/** The brand that marks a value as an expected error. */
const brand = "~raf";

/**
 * An expected error: plain tagged data with a brand, so it survives SSR,
 * RSC and router serialization as is.
 */
export type Fail<
	TError extends { readonly _tag: string } = { readonly _tag: string },
> = TError & { readonly [brand]: "fail" };

/**
 * Return it from a `queryFn` for an expected error. Its type becomes the
 * factory's `ErrorOf`:
 *
 * ```ts
 * queryFn: async () => {
 *   const res = await api.posts.get(slug);
 *   if (res.status === 404) return fail({ _tag: "NotFound", slug });
 *   return res.data;
 * }
 * ```
 */
export function fail<const TError extends { readonly _tag: string }>(
	error: TError,
): Fail<TError> {
	return { ...error, [brand]: "fail" };
}

/**
 * What reading or loading a query throws when its `queryFn` returned
 * `fail()`: an `Error`, for a stack and for error boundaries, that carries
 * the expected error in `fail` and the query's `hash`.
 */
export class QueryFailure<TFail extends Fail = Fail> extends Error {
	override readonly name = "QueryFailure";
	readonly [brand] = "failure";
	readonly fail: TFail;
	readonly hash: string;
	constructor(failValue: TFail, hash: string) {
		super(`Query ${hash} failed: ${failValue._tag}`);
		this.fail = failValue;
		this.hash = hash;
	}
}

export function isFailValue(value: unknown): value is Fail {
	return (
		typeof value === "object" &&
		value !== null &&
		brand in value &&
		value[brand] === "fail"
	);
}

export function isQueryFailure(value: unknown): value is QueryFailure {
	return (
		typeof value === "object" &&
		value !== null &&
		brand in value &&
		value[brand] === "failure"
	);
}

/**
 * The expected error in `value`, if it is one: a `fail()` value, or a
 * `QueryFailure` that wraps one. With `tag`, only that tag.
 *
 * ```ts
 * catch (error) {
 *   if (isFail(error, "NotFound")) throw notFound();
 * }
 * ```
 */
export function isFail<TTag extends string>(
	value: unknown,
	tag?: TTag,
): value is
	| Fail<{ readonly _tag: TTag }>
	| QueryFailure<Fail<{ readonly _tag: TTag }>> {
	const failValue = isQueryFailure(value) ? value.fail : value;
	return (
		isFailValue(failValue) && (tag === undefined || failValue._tag === tag)
	);
}

/** The `fail()` value in `value`, unwrapping a `QueryFailure`. */
export function failOf(value: unknown): Fail | undefined {
	if (isQueryFailure(value)) {
		return value.fail;
	}
	return isFailValue(value) ? value : undefined;
}

/** A read with `{ result: true }`: data, or the expected error. */
export type Result<TData, TFail> =
	| { readonly ok: true; readonly value: TData }
	| { readonly error: TFail; readonly ok: false };
