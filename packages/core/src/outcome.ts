/**
 * How a request ended. A rejected promise can't tell a failure (the
 * `queryFn`'s error, retried, typed in Effect) from a defect (a bug: a
 * synchronous throw, an Effect that died), so the engine settles with this
 * and each API turns it into a rejection or an `Exit`.
 */
export type Outcome<A = unknown> =
	| { readonly kind: "cancelled" }
	| { readonly defect: unknown; readonly kind: "defect" }
	| { readonly error: unknown; readonly kind: "failure" }
	| { readonly kind: "success"; readonly value: A };

export function succeeded<A>(value: A): Outcome<A> {
	return { kind: "success", value };
}

export function failed(error: unknown): Outcome<never> {
	return { error, kind: "failure" };
}

export function died(defect: unknown): Outcome<never> {
	return { defect, kind: "defect" };
}

/**
 * A request that was cancelled rather than settled: its entry was removed or
 * cleared, or an Effect `queryFn` was interrupted.
 */
export function cancelled(): Outcome<never> {
	return { kind: "cancelled" };
}

/**
 * The value, or a rejection with the error or defect. A cancelled request
 * rejects with an `AbortError`, as an aborted `fetch` does.
 */
export function unwrap<A>(outcome: Outcome<A>): A {
	switch (outcome.kind) {
		case "success":
			return outcome.value;
		case "failure":
			throw outcome.error;
		case "defect":
			throw outcome.defect;
		case "cancelled":
			throw new DOMException("The query was cancelled", "AbortError");
	}
}

/** Settle with a value or promise; a rejection is a failure. */
export function fromPromise<A>(value: A | PromiseLike<A>): Promise<Outcome<A>> {
	return Promise.resolve(value).then(succeeded, failed);
}
