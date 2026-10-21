/** Which boundary caught what, newest first, for the event log. */
import { useSyncExternalStore } from "react";

export interface Event {
	readonly by: string;
	readonly id: number;
	readonly root: boolean;
	readonly what: string;
}

let events: ReadonlyArray<Event> = [];
let next = 0;
const listeners = new Set<() => void>();

export const log = (event: Omit<Event, "id">): void => {
	events = [{ ...event, id: next++ }, ...events].slice(0, 30);
	for (const listener of listeners) {
		listener();
	}
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const useEvents = (): ReadonlyArray<Event> =>
	useSyncExternalStore(subscribe, () => events);
