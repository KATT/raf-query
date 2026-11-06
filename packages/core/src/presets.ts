import { invalidateOnAction } from "./action.ts";
import type { Feature, Link } from "./client.ts";
import {
	focusRefetch,
	polling,
	type PollingMeta,
	reconnectRefetch,
} from "./features.ts";
import { retry, type RetryMeta } from "./links.ts";

/** What `recommended()` returns: its parts keep the `meta` they declare. */
export interface Recommended {
	readonly features: readonly [
		Feature,
		Feature,
		Feature<{ readonly meta: PollingMeta }>,
		Feature,
	];
	readonly links: readonly [Link<{ readonly meta: RetryMeta }>];
}

/**
 * The behaviors most apps want: retries, refetching on focus and reconnect,
 * polling, and cache busting after actions. Spread it into the config:
 *
 * ```ts
 * createQueryClient({ ...recommended(), staleTime: 30_000 });
 * ```
 */
export function recommended(): Recommended {
	return {
		features: [
			focusRefetch(),
			reconnectRefetch(),
			polling(),
			invalidateOnAction(),
		],
		links: [retry()],
	};
}
