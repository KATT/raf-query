/**
 * How a request ended. A rejected promise can't tell a failure (the
 * `queryFn`'s error, retried, typed in Effect) from a defect (a bug: a
 * synchronous throw, an Effect that died), so the engine settles with this
 * and each API turns it into a rejection or an `Exit`.
 */
export type Outcome<A = unknown> =
	| { readonly defect: unknown; readonly kind: "defect" }
	| { readonly error: unknown; readonly kind: "failure" }
	| { readonly kind: "success"; readonly value: A };

/**
 * The failure of a request that was cancelled rather than settled: its
 * entry was removed or cleared, or an Effect `queryFn` was interrupted.
 */
export class CancelledError extends Error {
	readonly _tag = "CancelledError";
	override readonly message = "The query was cancelled";
}

export function succeeded<A>(value: A): Outcome<A> {
	return { kind: "success", value };
}

export function failed(error: unknown): Outcome<never> {
	return { error, kind: "failure" };
}

export function died(defect: unknown): Outcome<never> {
	return { defect, kind: "defect" };
}

export function cancelled(): Outcome<never> {
	return failed(new CancelledError());
}

export function isCancelled(outcome: Outcome): boolean {
	return outcome.kind === "failure" && outcome.error instanceof CancelledError;
}

/** The value, or a rejection with the error or defect. */
export function unwrap<A>(outcome: Outcome<A>): A {
	switch (outcome.kind) {
		case "success":
			return outcome.value;
		case "failure":
			throw outcome.error;
		case "defect":
			throw outcome.defect;
	}
}

/** Settle with a value or promise; a rejection is a failure. */
export function fromPromise<A>(value: A | PromiseLike<A>): Promise<Outcome<A>> {
	return Promise.resolve(value).then(succeeded, failed);
}
