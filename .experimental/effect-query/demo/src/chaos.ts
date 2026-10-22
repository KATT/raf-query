/**
 * What the chaos panel controls: the in-browser server reads it on every
 * request, and the transport on every message.
 */
import { useSyncExternalStore } from "react";

export interface Chaos {
	readonly deleted: ReadonlySet<number>;
	/** How long the server takes to answer, in milliseconds. */
	readonly latency: number;
	/** Docs the signed-in user can't open. */
	readonly locked: ReadonlySet<number>;
	readonly offline: boolean;
	/** `GetDoc` dies instead of answering: a defect, not a typed failure. */
	readonly serverBug: boolean;
	readonly signedIn: boolean;
}

let state: Chaos = {
	deleted: new Set(),
	latency: 400,
	locked: new Set([3]),
	offline: false,
	serverBug: false,
	signedIn: true,
};

const listeners = new Set<() => void>();

export const getChaos = (): Chaos => state;

export const setChaos = (patch: Partial<Chaos>): void => {
	state = { ...state, ...patch };
	for (const listener of listeners) {
		listener();
	}
};

export const toggle = (
	set: ReadonlySet<number>,
	id: number,
): ReadonlySet<number> => {
	const next = new Set(set);
	if (!next.delete(id)) {
		next.add(id);
	}
	return next;
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const useChaos = (): Chaos => useSyncExternalStore(subscribe, getChaos);
