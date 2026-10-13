import { Cause, Context, Effect, Exit, Layer, Scope } from "effect";

import { unsafeCast } from "../cast.ts";
import * as Entry from "../entry.ts";
import {
	CancelledError,
	died,
	failed,
	type Outcome,
	succeeded,
} from "../outcome.ts";
import type { EffectServices } from "../request.ts";

/** An Effect's exit as an engine outcome. Interrupts are cancellations. */
export function outcomeOf<A, E>(exit: Exit.Exit<A, E>): Outcome<A> {
	if (Exit.isSuccess(exit)) {
		return succeeded(exit.value);
	}
	const cause = exit.cause;
	if (Cause.hasInterruptsOnly(cause)) {
		return failed(new CancelledError());
	}
	return Cause.hasFails(cause)
		? failed(Cause.squash(cause))
		: died(Cause.squash(cause));
}

/**
 * Wait for an engine request. Failures are typed by the caller; defects stay
 * defects.
 */
export function awaitOutcome<A, E>(
	request: () => Promise<Outcome>,
): Effect.Effect<A, E> {
	return Effect.flatMap(Effect.promise(request), (outcome) => {
		switch (outcome.kind) {
			case "success":
				// SAFETY: the caller names the data type of the entry it waits on.
				return Effect.succeed(unsafeCast<A>(outcome.value));
			case "failure":
				// SAFETY: as above, for the entry's error type.
				return Effect.fail(unsafeCast<E>(outcome.error));
			case "defect":
				return Effect.die(outcome.defect);
		}
	});
}

function contextOf(context: unknown): Context.Context<never> {
	// SAFETY: only `fromContext` makes `EffectServices`, so every context the
	// engine holds is an Effect `Context`.
	return unsafeCast<Context.Context<never>>(context);
}

/**
 * Services for a cache's Effect `queryFn`s, from a `Context` you already
 * have. Each Effect runs with them, interrupted when its request is aborted.
 */
export function fromContext<TServices>(
	context: Context.Context<TServices>,
): EffectServices<TServices> {
	return {
		context,
		dispose: () => Promise.resolve(),
		run: (effect, requestContext, signal) => {
			if (!Effect.isEffect(effect)) {
				return Promise.resolve(died(effect));
			}
			// SAFETY: `requestContext` is this context or a verb caller's over
			// it, which the factory's `ServicesOf` made the caller provide.
			const provided =
				unsafeCast<Effect.Effect<unknown, unknown, never>>(effect);
			return Effect.runPromiseExit(
				Effect.provideContext(provided, contextOf(requestContext)),
				{ signal },
			).then(outcomeOf);
		},
	};
}

/**
 * Services from a layer, built now in their own scope:
 * `new QueryClient({ services: fromLayer(IssueApiLive) })`. The layer must
 * build synchronously; disposing the cache runs its finalizers.
 */
export function fromLayer<TServices>(
	layer: Layer.Layer<TServices>,
): EffectServices<TServices> {
	const scope = Scope.makeUnsafe();
	const context = Effect.runSync(Layer.buildWithScope(layer, scope));
	return {
		...fromContext(context),
		dispose: () => Effect.runPromise(Scope.close(scope, Exit.void)),
	};
}

/**
 * Run `entry`'s requests with the services of `caller`, a verb's fiber
 * context, over the cache's: every request from now on, including ones a
 * render, a refetch or `invalidate` starts. The caller's `Scope` is left
 * out: a request outlives the call that started it.
 */
export function provideCaller(
	entry: Entry.Entry,
	caller: Context.Context<never>,
) {
	const services = (entry.cache.services ??= fromContext(Context.empty()));
	Entry.provide(
		entry,
		Context.merge(
			contextOf(services.context),
			Context.omit(Scope.Scope)(caller),
		),
	);
}
