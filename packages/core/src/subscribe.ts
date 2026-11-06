/**
 * The kernel's one subscription primitive: `subscribe(listener, { signal })`.
 * Unsubscribe by aborting the signal, or by calling what it returns. There
 * is no error channel: errors live in entry state.
 */
export interface SubscribeOptions {
	readonly signal?: AbortSignal;
}

export interface Listeners<TEvent> {
	emit(event: TEvent): void;
	readonly size: number;
	subscribe(
		listener: (event: TEvent) => void,
		options?: SubscribeOptions,
	): () => void;
}

export function listeners<TEvent>(
	onSizeChange?: (size: number) => void,
): Listeners<TEvent> {
	const set = new Set<{ readonly listener: (event: TEvent) => void }>();
	return {
		emit(event) {
			for (const item of set) {
				item.listener(event);
			}
		},
		get size() {
			return set.size;
		},
		subscribe(listener, options) {
			const signal = options?.signal;
			if (signal?.aborted) {
				return () => {};
			}
			const item = { listener };
			set.add(item);
			onSizeChange?.(set.size);
			const unsubscribe = () => {
				if (set.delete(item)) {
					signal?.removeEventListener("abort", unsubscribe);
					onSizeChange?.(set.size);
				}
			};
			signal?.addEventListener("abort", unsubscribe, { once: true });
			return unsubscribe;
		},
	};
}
