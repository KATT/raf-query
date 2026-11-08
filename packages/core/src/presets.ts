import type { Feature, Link } from "./client.ts";
import {
	focusRefetch,
	type FocusRefetchMeta,
	polling,
	type PollingMeta,
	reconnectRefetch,
	type ReconnectRefetchMeta,
} from "./features.ts";
import { retry, type RetryMeta } from "./links.ts";

/** What `recommended()` returns: its parts keep the `meta` they declare. */
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
 */
export function recommended(): Recommended {
	return {
		features: [focusRefetch(), reconnectRefetch(), polling()],
		links: [retry()],
	};
}
