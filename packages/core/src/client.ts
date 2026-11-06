import type { Entry } from "./entry.ts";
import type { QueryKey, Stamp } from "./keys.ts";
import type { QueryOptions } from "./options.ts";
import type {
	AnyPart,
	AnyRoot,
	Decl,
	Declares,
	MetaOf,
	MetaOfDecl,
	RootTypes,
} from "./root.ts";

type LinkFunction = (
	op: Operation,
	next: (op: Operation) => Promise<unknown>,
) => Promise<unknown>;

type FeatureFunction = (client: QueryClient, signal: AbortSignal) => void;

/** Any link, whatever `meta` it reads. */
export type AnyLink = LinkFunction & AnyPart;

/** Any feature, whatever `meta` it reads. */
export type AnyFeature = FeatureFunction & AnyPart;
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

/** One request, as links see it. `TMeta` is what the link declares. */
export interface Operation<TMeta extends object = object> {
	readonly client: QueryClient;
	/** The entry's data when the request started (paged queries extend it). */
	readonly data: unknown;
	/** For paged queries: which page to add. */
	readonly direction: "next" | "previous" | undefined;
	readonly hasData: boolean;
	readonly hash: string;
	readonly input: unknown;
	/** The query's `meta`, `{}` when it has none. */
	readonly meta: TMeta;
	readonly options: QueryOptions;
	/** For paged queries: how many pages a first load fetches. */
	readonly pages: number | undefined;
	readonly queryKey: QueryKey;
	readonly signal: AbortSignal;
}

/**
 * Wraps every request, like a tRPC link. Call `next(op)` to run the rest of
 * the chain; the last link is the query's own `queryFn`. `TDecl` is the
 * `meta` it reads: see {@link link}.
 */
export type Link<TDecl extends Decl = Decl> = LinkFunction & Declares<TDecl>;

/**
 * A cache-wide behavior, started when a provider mounts the client and
 * stopped by `signal`. `TDecl` is the `meta` it reads: see {@link feature}.
 */
export type Feature<TDecl extends Decl = Decl> = FeatureFunction &
	Declares<TDecl>;

/**
 * A link that declares the `meta` fields it reads. A root's queries take
 * those fields only when the root has the link.
 *
 * ```ts
 * const traced = link<{ meta: { traceId?: string } }>((op, next) =>
 *   withTrace(op.meta.traceId, () => next(op)),
 * );
 * ```
 */
export function link<TDecl extends Decl = Decl>(
	run: (
		op: Operation<MetaOfDecl<TDecl> & object>,
		next: (op: Operation) => Promise<unknown>,
	) => Promise<unknown>,
): Link<TDecl> {
	// SAFETY: a query's `meta` is checked against its root's, which includes this link's.
	return run as Link<TDecl>;
}

const noop = () => {};

/**
 * A feature that declares the `meta` fields it reads. Without `setup`, it
 * only declares them: a root's own fields, such as an `owner` its targets
 * match on.
 *
 * ```ts
 * const ownership = feature<{ meta: { owner?: "posts-team" | "users-team" } }>();
 * ```
 */
export function feature<TDecl extends Decl = Decl>(
	setup: FeatureFunction = noop,
): Feature<TDecl> {
	return setup;
}

export type ClientEvent =
	| { readonly entry: Entry; readonly type: "added" | "removed" | "updated" }
	| { readonly entry: Entry; readonly type: "readers" };

export interface QueryClientConfig {
	readonly clock?: Clock;
	/** Behaviors started while a provider has the client mounted. */
	readonly features?: ReadonlyArray<AnyFeature>;
	/** Default `gcTime`: 5 minutes. Server clients never gc. */
	readonly gcTime?: number;
	/** Default: no `window`. Server clients never gc and never revalidate cached data. */
	readonly isServer?: boolean;
	/** Wrap every request, outermost first. */
	readonly links?: ReadonlyArray<AnyLink>;
	/** Default `staleTime`: `0`. */
	readonly staleTime?: number;
	/** Default `structuralSharing`: `true`. */
	readonly structuralSharing?: boolean;
}

/**
 * A query cache. `TTypes` is its root's types, which factories with
 * `def: defType<typeof makeQueryClient>()` are checked against. The bare
 * `QueryClient` type takes a client of any root.
 */
export interface QueryClient<TTypes extends RootTypes = AnyRoot> {
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
	/** Phantom: the root's types, invariant. `undefined` at runtime. */
	readonly "~types"?: { readonly root: (types: TTypes) => TTypes };
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
 * or spread `recommended()`. The client's `meta` type is what they declare.
 *
 * ```ts
 * const ownership = feature<{ meta: { owner?: "posts-team" | "users-team" } }>();
 * export const makeQueryClient = () =>
 *   createQueryClient({ links: [retry()], features: [ownership], staleTime: 30_000 });
 * ```
 *
 * Make one per request on the server (in a loader or a request-scoped
 * cache), never at module level.
 */
export function createQueryClient<
	const TLinks extends ReadonlyArray<AnyLink> = [],
	const TFeatures extends ReadonlyArray<AnyFeature> = [],
>(
	config: QueryClientConfig & {
		readonly features?: TFeatures;
		readonly links?: TLinks;
	} = {},
): QueryClient<{ readonly meta: MetaOf<[...TLinks, ...TFeatures]> }> {
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
	for (const start of client.config.features ?? []) {
		start(client, controller.signal);
	}
	return () => controller.abort();
}
