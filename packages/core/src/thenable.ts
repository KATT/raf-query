/**
 * Promises that carry their own result in the fields React's `use()` reads
 * before suspending (`status`, `value`, `reason`). A settled one is read
 * synchronously, so React renders it without a fallback.
 */
export type Thenable<T> = Promise<T> &
	(
		| { readonly reason: unknown; readonly status: "rejected" }
		| { readonly status: "fulfilled"; readonly value: T }
		| { readonly status: "pending" }
	);

const noop = () => {};

export function fulfilled<T>(value: T): Thenable<T> {
	return Object.assign(Promise.resolve(value), {
		status: "fulfilled" as const,
		value,
	});
}

export function rejected<T>(reason: unknown): Thenable<T> {
	const promise = Promise.reject(reason);
	// A rejection nobody reads (a failed prefetch) must not crash the process.
	promise.catch(noop);
	return Object.assign(promise, { reason, status: "rejected" as const });
}

export interface Pending<T> {
	readonly promise: Thenable<T>;
	reject(reason: unknown): void;
	resolve(value: T): void;
}

/** A pending thenable that settles in place, so `use()` resumes on it. */
export function pending<T>(): Pending<T> {
	const deferred = Promise.withResolvers<T>();
	const promise: Thenable<T> = Object.assign(deferred.promise, {
		status: "pending" as const,
	});
	promise.catch(noop);
	return {
		promise,
		reject(reason) {
			Object.assign(promise, { reason, status: "rejected" });
			deferred.reject(reason);
		},
		resolve(value) {
			Object.assign(promise, { status: "fulfilled", value });
			deferred.resolve(value);
		},
	};
}

/** `thenable` with `map` applied to its value, cached per source thenable. */
export function mapThenable<T, U>(
	cache: WeakMap<Thenable<unknown>, Thenable<unknown>>,
	thenable: Thenable<T>,
	map: (value: T) => U,
): Thenable<U> {
	const cached = cache.get(thenable);
	if (cached) {
		// SAFETY: the cache is per map function, keyed by its source.
		return cached as Thenable<U>;
	}
	let mapped: Thenable<U>;
	if (thenable.status === "fulfilled") {
		mapped = fulfilled(map(thenable.value));
	} else if (thenable.status === "rejected") {
		mapped = rejected(thenable.reason);
	} else {
		const next = pending<U>();
		thenable.then(
			(value) => next.resolve(map(value)),
			(error: unknown) => next.reject(error),
		);
		mapped = next.promise;
	}
	cache.set(thenable, mapped);
	return mapped;
}
