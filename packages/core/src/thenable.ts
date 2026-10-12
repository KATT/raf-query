/**
 * Promises that carry their own result, in the fields React's `use()` reads
 * before suspending (`status`, `value`, `reason`). A settled one can be read
 * synchronously, so React renders it without a fallback.
 */

const noop = () => {};

interface PendingStatus {
	readonly status: "pending";
}

interface FulfilledStatus<T> {
	readonly status: "fulfilled";
	readonly value: T;
}

interface RejectedStatus {
	readonly reason: unknown;
	readonly status: "rejected";
}

/**
 * A promise that says whether it has settled, and with what. `status` moves
 * from `"pending"` to `"fulfilled"` (with `value`) or `"rejected"` (with
 * `reason`) once, when the promise settles.
 */
export type Thenable<T> = Promise<T> &
	(FulfilledStatus<T> | PendingStatus | RejectedStatus);

function isTracked<T>(promise: Promise<T>): promise is Thenable<T> {
	return "status" in promise && typeof promise.status === "string";
}

/**
 * Keep `status` / `value` / `reason` on a promise current, the way React's
 * `use()` does, and return the same object typed as a {@link Thenable}.
 * Promises that already have a `status` are returned as they are.
 *
 * The fields are only set when the promise settles, a microtask after it
 * resolves, so track a promise when it is created, not when it is read.
 */
export function track<T>(promise: Promise<T>): Thenable<T> {
	if (isTracked(promise)) {
		return promise;
	}
	const thenable: Thenable<T> = Object.assign(promise, {
		status: "pending" as const,
	});
	void promise.then(
		(value) => {
			if (thenable.status === "pending") {
				Object.assign(thenable, { status: "fulfilled", value });
			}
		},
		(error: unknown) => {
			if (thenable.status === "pending") {
				Object.assign(thenable, { reason: error, status: "rejected" });
			}
		},
	);
	return thenable;
}

export function fulfilled<T>(value: T): Thenable<T> {
	return Object.assign(Promise.resolve(value), {
		status: "fulfilled" as const,
		value,
	});
}

export interface Pending<T> {
	readonly promise: Thenable<T>;
	reject(reason: unknown): void;
	resolve(value: T): void;
}

export function pending<T>(): Pending<T> {
	const deferred = Promise.withResolvers<T>();
	const promise = Object.assign(deferred.promise, {
		status: "pending" as const,
	});
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
