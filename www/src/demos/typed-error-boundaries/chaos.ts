/** What the chaos switches change. The handlers and the transport read it on every call. */
interface Chaos {
	readonly deleted: ReadonlySet<number>;
	readonly locked: ReadonlySet<number>;
	readonly offline: boolean;
	readonly serverBug: boolean;
	readonly signedIn: boolean;
}

let chaos: Chaos = {
	deleted: new Set(),
	locked: new Set([3]),
	offline: false,
	serverBug: false,
	signedIn: true,
};
const listeners = new Set<() => void>();

export function getChaos() {
	return chaos;
}

export function setChaos(patch: Partial<Chaos>) {
	chaos = { ...chaos, ...patch };
	for (const listener of listeners) {
		listener();
	}
}

export function subscribeChaos(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function toggle(
	set: ReadonlySet<number>,
	id: number,
): ReadonlySet<number> {
	const next = new Set(set);
	if (!next.delete(id)) {
		next.add(id);
	}
	return next;
}
