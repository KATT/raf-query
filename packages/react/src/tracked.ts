import type { QueryState } from "@raf-query/core";

type TrackedField = keyof QueryState<unknown>;

/**
 * Which state fields one `useQuery` call has read, so a change to any other
 * field doesn't re-render it. Mirrors TanStack Query's tracked results
 * (`QueryObserver.trackResult`).
 */
export class ControlsTracker {
	#fields = new Set<TrackedField>();
	#rendered: QueryState<unknown> | undefined;

	/**
	 * `controls` plus the controls backed by state fields, as getters: reading
	 * one is what makes a change to its field re-render the component.
	 */
	controls<TControls extends object>(
		state: QueryState<unknown>,
		updatedAt: number,
		controls: TControls,
	) {
		const read = <TField extends TrackedField>(field: TField) => {
			this.#fields.add(field);
			return state[field];
		};
		return {
			...controls,
			get error() {
				return read("error");
			},
			get isFetching() {
				return read("isFetching");
			},
			get isFetchingNextPage() {
				return read("fetchDirection") === "forward";
			},
			get isFetchingPreviousPage() {
				return read("fetchDirection") === "backward";
			},
			get isStale() {
				return read("isStale");
			},
			get updatedAt() {
				read("updatedAt");
				return updatedAt;
			},
		};
	}

	/** Record the state a commit rendered; later changes compare against it. */
	committed(state: QueryState<unknown>) {
		this.#rendered = state;
	}

	/** Whether `next` differs from the committed state in a field that was read. */
	changed(next: QueryState<unknown>): boolean {
		const rendered = this.#rendered;
		if (
			rendered === undefined ||
			rendered.promise !== next.promise ||
			rendered.hasData !== next.hasData ||
			// A failed first load rejects the same promise it handed out.
			(!next.hasData && rendered.status !== next.status)
		) {
			return true;
		}
		for (const field of this.#fields) {
			if (rendered[field] !== next[field]) {
				return true;
			}
		}
		return false;
	}
}
