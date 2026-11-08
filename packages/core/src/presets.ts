import type { Feature, Link } from "./client.ts";
import {
	focusRefetch,
	type FocusRefetchMeta,
} from "./features/focus-refetch/focus-refetch.ts";
import { polling, type PollingMeta } from "./features/polling/polling.ts";
import {
	reconnectRefetch,
	type ReconnectRefetchMeta,
} from "./features/reconnect-refetch/reconnect-refetch.ts";
import { retry, type RetryMeta } from "./links/retry/retry.ts";

/**
 * What `recommended()` returns: its parts keep the `meta` they declare.
 *
 * @see https://raf-query.katt.dev/docs/important-defaults
 */
export interface Recommended {
	readonly features: readonly [
		Feature<{ readonly meta: FocusRefetchMeta }>,
		Feature<{ readonly meta: ReconnectRefetchMeta }>,
		Feature<{ readonly meta: PollingMeta }>,
	];
	readonly links: readonly [Link<{ readonly meta: RetryMeta }>];
}

/**
 * The behaviors most apps want: retries, refetching on focus and reconnect,
 * and polling. Spread it into the config:
 *
 * ```ts
 * createQueryClient({ ...recommended(), staleTime: 30_000 });
 * ```
 *
 * @see https://raf-query.katt.dev/docs/important-defaults
 */
export function recommended(): Recommended {
	return {
		features: [focusRefetch(), reconnectRefetch(), polling()],
		links: [retry()],
	};
}
