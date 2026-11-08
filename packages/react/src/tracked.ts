import type { Thenable } from "@raf-query/core";

/** A state function, such as `refetch`. */
type Action = (...args: Array<never>) => Promise<void>;

/** The state a kind of query adds: data fields, and functions. */
export interface Fields {
	readonly actions: Readonly<Record<string, Action>>;
	readonly fields: Readonly<Record<string, unknown>>;
}

/** The state object a hook returns: fields read through it are tracked. */
export type TrackedState = Readonly<Record<string, unknown>>;

/** What a hook reads for one render: its state, and the thenable before `select` or `result`. */
export interface Read extends Fields {
	readonly source: Thenable<unknown>;
}

/** What the last render returned, and how to read the entry again. */
interface Rendered extends Read {
	/** Reads the entry as it is now, for a write's subscriber. */
	readonly refresh: () => Read;
	readonly status: string;
}

/**
 * Which state fields a hook's component has read, and what it last
 * rendered. Modelled on TanStack Query's `QueryObserver`: `trackResult`
 * wraps the result in a `Proxy` whose reads add to `#trackedProps`, and
 * `updateResult` notifies only when a tracked prop changed. Held in
 * `useState` and changed only by the functions below.
 */
export interface Tracker {
	readonly actions: Map<string, Action>;
	proxy: TrackedState | undefined;
	rendered: Rendered | undefined;
	readonly tracked: Set<string>;
}

export function createTracker(): Tracker {
	return {
		actions: new Map(),
		proxy: undefined,
		rendered: undefined,
		tracked: new Set(),
	};
}

function renderedOf(tracker: Tracker): Rendered {
	// SAFETY: proxies and subscribers only run after the first render, which sets it.
	return tracker.rendered as Rendered;
}

/** A function that calls the latest render's, so it keeps its identity across renders. */
function stableAction(tracker: Tracker, name: string): Action {
	let action = tracker.actions.get(name);
	if (!action) {
		action = (...args) => {
			// SAFETY: a state's functions keep their names across renders.
			const latest = renderedOf(tracker).actions[name] as Action;
			return latest(...args);
		};
		tracker.actions.set(name, action);
	}
	return action;
}

function proxyOf(tracker: Tracker, read: Read) {
	return new Proxy(
		{ ...read.fields, ...read.actions },
		{
			get(_, key) {
				const name = String(key);
				if (read.actions[name]) {
					return stableAction(tracker, name);
				}
				tracker.tracked.add(name);
				return renderedOf(tracker).fields[name];
			},
		},
	);
}

/** Functions are stable, so only data fields count as changes. */
function trackedChanged(tracker: Tracker, next: Fields): boolean {
	const previous = renderedOf(tracker).fields;
	return [...tracker.tracked].some(
		(name) => !Object.is(previous[name], next.fields[name]),
	);
}

/**
 * The state a render returns: the same object as the last render's unless
 * a field the component read changed. Reads go through to this render's
 * fields, so a field first read now is current, and is tracked from now on.
 */
export function trackedState(
	tracker: Tracker,
	read: Read,
	refresh: () => Read,
): TrackedState {
	if (tracker.proxy === undefined || trackedChanged(tracker, read)) {
		tracker.proxy = proxyOf(tracker, read);
	}
	tracker.rendered = { ...read, refresh, status: read.source.status };
	return tracker.proxy;
}

/**
 * Whether a write changed what the component rendered: the thenable or its
 * outcome, or a field it read. Fields it never read don't re-render it.
 */
export function renderedChanged(tracker: Tracker): boolean {
	const rendered = renderedOf(tracker);
	const next = rendered.refresh();
	return (
		next.source !== rendered.source ||
		next.source.status !== rendered.status ||
		trackedChanged(tracker, next)
	);
}
