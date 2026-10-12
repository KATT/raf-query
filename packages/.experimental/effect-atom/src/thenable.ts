import type { Thenable } from "@raf-query/core";
import { Cause, Option } from "effect";
import { AsyncResult } from "effect/reactivity";

import { type Entry, type Result, startUnsafe } from "./entry.ts";

export type { Thenable } from "@raf-query/core";

function noop() {}

function fulfilled(value: unknown): Thenable<unknown> {
	return Object.assign(Promise.resolve(value), {
		status: "fulfilled" as const,
		value,
	});
}

function rejected(reason: unknown): Thenable<unknown> {
	const promise = Object.assign(Promise.reject(reason), {
		reason,
		status: "rejected" as const,
	});
	promise.catch(noop);
	return promise;
}

/** A first-load error: a failure with no earlier data, and no retry running. */
function firstLoadFailure(
	result: Result,
): AsyncResult.Failure<unknown, unknown> | undefined {
	return AsyncResult.isFailure(result) &&
		!result.waiting &&
		Option.isNone(result.previousSuccess)
		? result
		: undefined;
}

/**
 * A promise that settles with the entry's first data, or its first-load
 * error. It becomes the entry's `loaded` / `failed` promise, so readers keep
 * the same object after it settles.
 */
function firstLoad(entry: Entry): Thenable<unknown> {
	const promises = entry.promises;
	const deferred = Promise.withResolvers<unknown>();
	const promise = Object.assign(deferred.promise, {
		status: "pending" as const,
	});
	// A rejection nobody reads (a failed prefetch) must not crash the process.
	promise.catch(noop);
	let unsubscribe = noop;
	let done = false;
	const settle = (result: Result) => {
		const value = AsyncResult.value(result);
		const failure = firstLoadFailure(result);
		if (Option.isNone(value) && failure === undefined) {
			return;
		}
		done = true;
		unsubscribe();
		if (promises.pending === promise) {
			promises.pending = undefined;
		}
		if (Option.isSome(value)) {
			Object.assign(promise, { status: "fulfilled", value: value.value });
			promises.loaded = { promise, value: value.value };
			deferred.resolve(value.value);
		} else if (failure) {
			const reason = Cause.squash(failure.cause);
			Object.assign(promise, { reason, status: "rejected" });
			promises.failed = { cause: failure.cause, promise, shown: false };
			deferred.reject(reason);
		}
	};
	// Subscribing holds the atom, so it isn't idled out while a reader waits.
	unsubscribe = entry.store.registry.subscribe(entry.data, settle, {
		immediate: true,
	});
	if (done) {
		unsubscribe();
	}
	return promise;
}

/**
 * The promise for an entry's current result: fulfilled with its data,
 * rejected with a first-load error, or pending until one of those. One
 * object per data (or error) version, so readers re-render only when it
 * changes.
 *
 * A first-load error is handed out until the end of the current task (React
 * re-renders a throwing tree synchronously before showing its error
 * boundary); a read after that, such as the boundary's reset, retries.
 */
export function promiseFor(entry: Entry, result: Result): Thenable<unknown> {
	const promises = entry.promises;
	const value = AsyncResult.value(result);
	if (Option.isSome(value)) {
		let loaded = promises.loaded;
		if (loaded === undefined || loaded.value !== value.value) {
			loaded = { promise: fulfilled(value.value), value: value.value };
			promises.loaded = loaded;
		}
		return loaded.promise;
	}
	const failure = firstLoadFailure(result);
	if (failure) {
		if (promises.failed?.cause !== failure.cause) {
			promises.failed = {
				cause: failure.cause,
				promise: rejected(Cause.squash(failure.cause)),
				shown: false,
			};
		}
		const failed = promises.failed;
		if (!failed.shown) {
			queueMicrotask(() => {
				failed.shown = true;
			});
			return failed.promise;
		}
		startUnsafe(entry);
	}
	promises.pending ??= firstLoad(entry);
	return promises.pending;
}
