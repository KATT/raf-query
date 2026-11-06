import type { Entry } from "./entry.ts";
import type { QueryKey, Stamp } from "./keys.ts";
import type { QueryMeta, QueryOptions } from "./options.ts";
import {
	listeners,
	type Listeners,
	type SubscribeOptions,
} from "./subscribe.ts";

/** Time and timers, injectable so tests control them without patching globals. */
export interface Clock {
	clearTimeout(handle: unknown): void;
	now(): number;
	setTimeout(callback: () => void, ms: number): unknown;
}

export const systemClock: Clock = {
	clearTimeout: (handle) => {
		clearTimeout(
			// SAFETY: handles come from `setTimeout` below.
			handle as ReturnType<typeof setTimeout>,
		);
	},
	now: () => Date.now(),
	setTimeout: (callback, ms) => setTimeout(callback, ms),
};

/** One request, as links see it. */
export interface Operation {
	readonly client: QueryClient;
	/** The entry's data when the request started (paged queries extend it). */
	readonly data: unknown;
	/** For paged queries: which page to add. */
	readonly direction: "next" | "previous" | undefined;
	readonly hasData: boolean;
	readonly hash: string;
	readonly input: unknown;
	readonly meta: QueryMeta | undefined;
	readonly options: QueryOptions;
	/** For paged queries: how many pages a first load fetches. */
	readonly pages: number | undefined;
	readonly queryKey: QueryKey;
	readonly signal: AbortSignal;
}

/**
 * Wraps every request, like a tRPC link. Call `next(op)` to run the rest of
 * the chain; the last link is the query's own `queryFn`.
 */
export type Link = (
	op: Operation,
	next: (op: Operation) => Promise<unknown>,
) => Promise<unknown>;

/** A cache-wide behavior, started when a provider mounts the client and stopped by `signal`. */
export type Feature = (client: QueryClient, signal: AbortSignal) => void;

export type ClientEvent =
	| { readonly entry: Entry; readonly type: "added" | "removed" | "updated" }
	| { readonly entry: Entry; readonly type: "readers" };

export interface QueryClientConfig {
	readonly clock?: Clock;
	/** Behaviors started while a provider has the client mounted. */
	readonly features?: ReadonlyArray<Feature>;
	/** Default `gcTime`: 5 minutes. Server clients never gc. */
	readonly gcTime?: number;
	/** Default: no `window`. Server clients never gc and never revalidate cached data. */
	readonly isServer?: boolean;
	/** Wrap every request, outermost first. */
	readonly links?: ReadonlyArray<Link>;
	/** Default `staleTime`: `0`. */
	readonly staleTime?: number;
	/** Default `structuralSharing`: `true`. */
	readonly structuralSharing?: boolean;
}

export interface QueryClient {
	/** Set on a React Server Components SSR client: renders start no request. */
	"~browserOnly": boolean;
	/** Entries changed since the last notification. */
	readonly "~changed": Set<Entry>;
	readonly "~entries": Map<string, Entry>;
	readonly "~events": Listeners<ClientEvent>;
	/** Orders requests and invalidations. */
	"~seq": number;
	/** Invalidations not yet older than every entry's data. */
	"~stamps": Array<Stamp>;
	readonly clock: Clock;
	readonly config: QueryClientConfig;
	readonly isServer: boolean;
	/** Cache events: entries added, updated, removed, or gaining and losing readers. */
	subscribe(
		listener: (event: ClientEvent) => void,
		options?: SubscribeOptions,
	): () => void;
}

/**
 * Create a query client. Behaviors are opt-in: pass `links` and `features`,
 * or spread `recommended()`.
 *
 * ```ts
 * export const makeQueryClient = () =>
 *   createQueryClient({ ...recommended(), staleTime: 30_000 });
 * ```
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
	const events = listeners<ClientEvent>();
	return {
		"~browserOnly": false,
		"~changed": new Set(),
		"~entries": new Map(),
		"~events": events,
		"~seq": 0,
		"~stamps": [],
		clock: config.clock ?? systemClock,
		config,
		isServer: config.isServer ?? !("window" in globalThis),
		subscribe: (listener, options) => events.subscribe(listener, options),
	};
}

/**
 * Start the client's features. Providers call it while mounted; the
 * returned function stops them.
 */
export function mount(client: QueryClient): () => void {
	const controller = new AbortController();
	for (const feature of client.config.features ?? []) {
		feature(client, controller.signal);
	}
	return () => controller.abort();
}
