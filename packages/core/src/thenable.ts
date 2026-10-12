/**
 * Promises that React's `use()` can read synchronously. React checks
 * `status` / `value` / `reason` on a thenable before suspending, so a
 * settled one renders without a fallback.
 */

const noop = () => {};

export function fulfilled<T>(value: T): Promise<T> {
	return Object.assign(Promise.resolve(value), {
		status: "fulfilled",
		value,
	});
}

export interface Pending<T> {
	readonly promise: Promise<T>;
	reject(reason: unknown): void;
	resolve(value: T): void;
}

export function pending<T>(): Pending<T> {
	const deferred = Promise.withResolvers<T>();
	const promise = Object.assign(deferred.promise, { status: "pending" });
	// A rejection nobody reads (a failed prefetch) must not crash the process.
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
