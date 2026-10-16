import type {
	DehydratedQuery,
	DehydratedResult,
	DehydratedState,
} from "@raf-query/experimental-vue";

import type { InitialLoad } from "./router.ts";

/** A dehydrated query, with a pending one's promise replaced by its stream id. */
export type BootQuery =
	| Omit<DehydratedQuery, "promise">
	| (Omit<DehydratedQuery, "promise"> & { readonly pending: number });

/** What the server render hands the browser in `window.rafQueryBoot`. */
export interface Boot {
	readonly load: InitialLoad | undefined;
	readonly queries: ReadonlyArray<BootQuery>;
}

/** A pending query's result, as the server streams it. */
export type StreamedResult =
	| { readonly error: string }
	| { readonly value: DehydratedResult };

declare global {
	interface Window {
		rafQueryBoot: Boot & {
			readonly settled: Record<number, StreamedResult>;
			readonly waiting: Record<number, (result: StreamedResult) => void>;
		};
	}
}

/**
 * The server's dehydrated state, with each pending query's streamed result
 * as its promise. The promises wait for `mounted`: a result that settles
 * before hydration would render data where the server's HTML has skeletons.
 */
export function bootState(mounted: Promise<void>): DehydratedState {
	const boot = window.rafQueryBoot;
	const wait = async (id: number) => {
		await mounted;
		return new Promise<DehydratedResult>((resolve, reject) => {
			const settle = (result: StreamedResult) => {
				if ("error" in result) {
					reject(new Error(result.error));
				} else {
					resolve(result.value);
				}
			};
			const settled = boot.settled[id];
			if (settled) {
				settle(settled);
			} else {
				boot.waiting[id] = settle;
			}
		});
	};
	return {
		queries: boot.queries.map((query) => {
			if (!("pending" in query)) {
				return query;
			}
			const { pending, ...sent } = query;
			return { ...sent, promise: wait(pending) };
		}),
	};
}
