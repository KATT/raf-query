import type { Part } from "./client.ts";
import {
	type FocusRefetch,
	focusRefetch,
} from "./features/focus-refetch/focus-refetch.ts";
import { type Polling, polling } from "./features/polling/polling.ts";
import {
	type ReconnectRefetch,
	reconnectRefetch,
} from "./features/reconnect-refetch/reconnect-refetch.ts";
import { type Retry, retry } from "./links/retry/retry.ts";

/**
 * What `recommended()` returns: its parts keep what they declare.
 *
 * @see https://raf-query.katt.dev/docs/important-defaults
 */
export type Recommended = readonly [
	Part<Retry>,
	Part<FocusRefetch>,
	Part<ReconnectRefetch>,
	Part<Polling>,
];

/**
 * The behaviors most apps want: retries, refetching on focus and reconnect,
 * and polling. Pass it as the client's parts, or spread it among your own:
 *
 * ```ts
 * createQueryClient({ parts: recommended(), defaults: { staleTime: 30_000 } });
 * ```
 *
 * @see https://raf-query.katt.dev/docs/important-defaults
 */
export function recommended(): Recommended {
	return [retry(), focusRefetch(), reconnectRefetch(), polling()];
}
