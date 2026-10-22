import type { Cause } from "effect";

interface Caught {
	readonly by: string;
	readonly id: number;
	readonly what: string;
}

/** What a fallback gets: the root's Cause, or a boundary's typed failure. */
export type Failure = Cause.Cause<unknown> | Cause.YieldableError;

let caught: ReadonlyArray<Caught> = [];
let next = 0;
const logged = new WeakSet<Failure>();
const listeners = new Set<() => void>();

/** Logs a failure once: a fallback calls it when it mounts. */
export function logCaught(failure: Failure, by: string, what: string) {
	if (logged.has(failure)) {
		return;
	}
	logged.add(failure);
	caught = [{ by, id: next++, what }, ...caught].slice(0, 8);
	for (const listener of listeners) {
		listener();
	}
}

export function getCaught() {
	return caught;
}

export function subscribeCaught(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
