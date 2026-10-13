import { type Context, Effect, Fiber, Scope } from "effect";

/**
 * Background fibers by key, at most one per key: forking a key interrupts
 * its previous fiber. Closing `scope` interrupts every fiber and waits for
 * them; forks after that do nothing. The subset of `FiberMap` the engine
 * uses, without its `MutableHashMap` / `Deferred` machinery, which every app
 * would otherwise bundle.
 */
export interface Fibers<K> {
	fork(
		key: K,
		effect: Effect.Effect<void>,
		options?: { readonly onlyIfMissing?: boolean },
	): void;
	has(key: K): boolean;
	interrupt(key: K): void;
}

export function makeUnsafe<K>(
	scope: Scope.Scope,
	services: Context.Context<never>,
): Fibers<K> {
	const fibers = new Map<K, Fiber.Fiber<void>>();
	const runFork = Effect.runForkWith(services);
	let closed = false;
	Effect.runSync(
		Scope.addFinalizer(
			scope,
			Effect.suspend(() => {
				closed = true;
				const running = [...fibers.values()];
				fibers.clear();
				return Fiber.interruptAll(running);
			}),
		),
	);
	return {
		fork(key, effect, options) {
			if (closed || (options?.onlyIfMissing && fibers.has(key))) {
				return;
			}
			const previous = fibers.get(key);
			const fiber = runFork(effect);
			// Install the replacement before interrupting, in case the previous
			// fiber's finalizers fork this key again.
			fibers.set(key, fiber);
			previous?.interruptUnsafe();
			fiber.addObserver(() => {
				if (fibers.get(key) === fiber) {
					fibers.delete(key);
				}
			});
		},
		has: (key) => fibers.has(key),
		interrupt(key) {
			const fiber = fibers.get(key);
			if (fiber) {
				fibers.delete(key);
				fiber.interruptUnsafe();
			}
		},
	};
}
