import { died, fromPromise, type Outcome } from "./outcome.ts";
import { hasProperty } from "./predicate.ts";

declare const servicesType: unique symbol;

/**
 * Runs the `queryFn`s that return an Effect, and holds the services they
 * need. The engine never imports Effect: `fromLayer` and `fromContext` from
 * `@raf-query/core/effect` make one, and `QueryCache.make` there passes its
 * fiber's.
 */
export interface EffectServices<TServices = unknown> {
	/**
	 * What requests run with until a verb's caller provides its own; an
	 * Effect `Context`, opaque to the engine.
	 */
	readonly context: unknown;
	/** Release the services (a layer's finalizers). */
	dispose(): Promise<void>;
	/** Run `effect` with `context` until `signal` aborts, which interrupts it. */
	run(
		effect: unknown,
		context: unknown,
		signal: AbortSignal,
	): Promise<Outcome<unknown>>;
	/** Type-only: the services `context` provides. Never present at runtime. */
	readonly [servicesType]?: () => TServices;
}

/** The services a request runs with, and what runs its Effects. */
export interface RequestServices {
	readonly context: unknown;
	readonly services: EffectServices | undefined;
}

const missingServices = () =>
	new Error(
		"raf-query: a queryFn returned an Effect, but the cache has no services to run it. Pass `services: fromLayer(layer)` or `fromContext(context)` from `@raf-query/react/effect` (or `@raf-query/core/effect`).",
	);

function isEffect(value: unknown): boolean {
	return hasProperty(value, "~effect/Effect");
}

function report(outcome: Outcome) {
	if (outcome.kind === "defect") {
		// oxlint-disable-next-line eslint/no-console -- a defect is a bug; React reports errors the same way
		console.error("raf-query: queryFn died", outcome.defect);
	}
	return outcome;
}

/**
 * One `queryFn` call. Plain values settle like promises, a microtask later.
 * A `queryFn` that throws instead of returning is a defect, as in
 * `Effect.sync`, and so is an Effect that dies; both are reported on the
 * console. `onEffect` is called before an Effect runs: aborting `signal`
 * interrupts it, so it counts as reading the signal.
 */
export function callQueryFn(
	call: () => unknown,
	signal: AbortSignal,
	request: RequestServices,
	onEffect: () => void,
): Promise<Outcome> {
	let result: unknown;
	try {
		result = call();
	} catch (error) {
		return Promise.resolve(report(died(error)));
	}
	if (!isEffect(result)) {
		return fromPromise(result);
	}
	onEffect();
	const services = request.services;
	if (!services) {
		return Promise.resolve(report(died(missingServices())));
	}
	return services.run(result, request.context, signal).then(report);
}
