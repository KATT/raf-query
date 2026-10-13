/**
 * `QueryObserver` from `@raf-query/core`, plus Effect constructors and a
 * stream of its results.
 */
import { Effect, type Stream } from "effect";

import type { QueryFactory } from "../options.ts";
import * as Observer from "../observer.ts";
import type * as Query from "../query.ts";
import { listen } from "./listen.ts";

export * from "../observer.ts";

/** `makeUnsafe`, as an Effect. */
export function make<TData, TFactory extends QueryFactory>(
	query: Query.Query<TData, TFactory>,
	options?: Observer.Options,
): Effect.Effect<Observer.QueryObserver<TData, TFactory>> {
	return Effect.sync(() => Observer.makeUnsafe(query, options));
}

/** `getUnsafe`, as an Effect. */
export function get<TData, TFactory extends QueryFactory>(
	self: Observer.QueryObserver<TData, TFactory>,
): Effect.Effect<Observer.Result<TData>> {
	return Effect.sync(() => Observer.getUnsafe(self));
}

/**
 * The current result, then every change listeners are notified of. Counts
 * as a listener while the stream runs, so the query counts as read.
 */
export function changes<TData, TFactory extends QueryFactory>(
	self: Observer.QueryObserver<TData, TFactory>,
): Stream.Stream<Observer.Result<TData>> {
	return listen((push) => {
		let last: Observer.Result<TData> | undefined;
		const emit = () => {
			const result = Observer.getUnsafe(self);
			if (result !== last) {
				last = result;
				push(result);
			}
		};
		const unsubscribe = Observer.subscribeUnsafe(self, emit);
		emit();
		return unsubscribe;
	});
}
