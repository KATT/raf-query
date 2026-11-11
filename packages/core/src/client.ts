import type { Entry } from "./entry.ts";
import type { QueryKey } from "./keys/keys.ts";
import type { Stamp } from "./keys/targets.ts";
import type { CoreOptions, QueryOptions } from "./options.ts";
import type {
	AnyDeclares,
	ContextOfDecl,
	Decl,
	Declares,
	NoDecl,
	NoParts,
	OptionsOfDecl,
	Root,
	RootOfParts,
	RootTypes,
} from "./root.ts";

import {
	listeners,
	type Listeners,
	type SubscribeOptions,
} from "./subscribe.ts";

/**
 * Time and timers, injectable so tests control them without patching globals.
 *
 * @see https://raf-query.katt.dev/docs/testing#time
 */
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

/**
 * One request, as a part's link sees it. `TDecl` is what the part declares:
 * `options` has the fields it reads.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#parts
 */
export interface Operation<TDecl extends Decl = Decl> {
	readonly client: QueryClient;
	/**
	 * What the `queryFn` gets beside the client, key and signal: the parts'
	 * context, as the links before this one left it. Pass `next` an
	 * operation with another `context` to change it for this request.
	 */
	readonly context: Partial<ContextOfDecl<TDecl>>;
	/** The entry's data when the request started (paged queries extend it). */
	readonly data: unknown;
	/** For paged queries: which page to add. */
	readonly direction: "next" | "previous" | undefined;
	readonly hasData: boolean;
	readonly hash: string;
	readonly input: unknown;
	/** The query's options, over the client's `defaults`. */
	readonly options: Partial<OptionsOfDecl<TDecl>> & QueryOptions;
	/** For paged queries: how many pages a first load fetches. */
	readonly pages: number | undefined;
	readonly queryKey: QueryKey;
	readonly signal: AbortSignal;
}

type LinkFunction = (
	op: Operation,
	next: (op: Operation) => Promise<unknown>,
) => Promise<unknown>;

type SetupFunction = (client: QueryClient, signal: AbortSignal) => void;

/**
 * One piece of a client's behavior: any of a link that wraps every request,
 * a feature's `setup`, and values for every `queryFn`'s context. `TDecl` is
 * what it declares: see {@link part}.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#parts
 */
export interface Part<TDecl extends Decl = NoDecl> extends Declares<TDecl> {
	readonly context?: object;
	readonly link?: LinkFunction;
	readonly setup?: SetupFunction;
}

/** Any part, whatever it declares. */
export interface AnyPart extends AnyDeclares {
	readonly context?: object;
	readonly link?: LinkFunction;
	readonly setup?: SetupFunction;
}

type LinkOf<TDecl extends Decl, TNext> = (
	op: Operation<TDecl>,
	next: (op: TNext) => Promise<unknown>,
) => Promise<unknown>;

interface PartSetup<TDecl extends Decl> {
	/**
	 * A cache-wide behavior, started when a provider mounts the client and
	 * stopped by `signal`. The client is typed with this part, so it runs
	 * the factories of a builder bound to it.
	 */
	readonly setup?: (
		client: QueryClient<Root<TDecl>>,
		signal: AbortSignal,
	) => void;
}

/** The context a declaration says its part gives. */
type DeclaredContext<TDecl extends ContextDecl> = TDecl["context"];

/** A declaration with a `context`: its part gives it. */
interface ContextDecl extends Decl {
	readonly context: object;
}

/** What {@link part} takes for a part that declares no `context`. */
interface PlainDefinition<TDecl extends Decl> extends PartSetup<TDecl> {
	readonly context?: never;
	/**
	 * Wraps every request, like a tRPC link. Call `next(op)` to run the
	 * rest of the chain; the last link is the query's own `queryFn`.
	 */
	readonly link?: LinkOf<TDecl, Operation<TDecl>>;
}

/** What {@link part} takes for a part that gives its `context` for the client. */
interface ClientContextDefinition<
	TDecl extends ContextDecl,
> extends PartSetup<TDecl> {
	/** Merged into the context of every `queryFn` the client runs. */
	readonly context: DeclaredContext<TDecl>;
	/**
	 * Wraps every request, like a tRPC link. Call `next(op)` to run the
	 * rest of the chain; the last link is the query's own `queryFn`. An
	 * operation with another `context` changes it for that request.
	 */
	readonly link?: LinkOf<TDecl, Operation<TDecl>>;
}

/** What {@link part} takes for a part that gives its `context` per request. */
interface RequestContextDefinition<
	TDecl extends ContextDecl,
> extends PartSetup<TDecl> {
	readonly context?: never;
	/**
	 * Wraps every request, and gives each the context the part declares:
	 * `next` takes an operation whose `context` has it.
	 */
	readonly link: LinkOf<
		TDecl,
		Operation<TDecl> & { readonly context: DeclaredContext<TDecl> }
	>;
}

/** A declaration without a `context`: its part needs no definition. */
interface OptionsDecl {
	readonly context?: never;
	readonly options?: object;
}

/**
 * A part of a client, with what it declares: the per-query `options` it
 * reads and the `context` it gives every `queryFn`. A client's queries take
 * those options, and get that context, only when the client has the part.
 *
 * ```ts
 * interface Traced {
 *   readonly options: { readonly traceId?: string };
 * }
 * const traced = part<Traced>({
 *   link: (op, next) => withTrace(op.options.traceId, () => next(op)),
 * });
 * ```
 *
 * A part without a link or `setup` only declares: an app's own options, such
 * as an `owner` its targets match on.
 *
 * A part gives the `context` it declares for the client, as `context`, or
 * per request, from its link:
 *
 * ```ts
 * interface Session {
 *   readonly context: { readonly token: string };
 * }
 * const session = part<Session>({
 *   link: async (op, next) =>
 *     next({ ...op, context: { ...op.context, token: await freshToken() } }),
 * });
 * ```
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#parts
 */
export function part<TDecl extends OptionsDecl = NoDecl>(
	definition?: PlainDefinition<NoInfer<TDecl>>,
): Part<NoInfer<TDecl>>;
export function part<TDecl extends ContextDecl>(
	definition: ClientContextDefinition<NoInfer<TDecl>>,
): Part<NoInfer<TDecl>>;
export function part<TDecl extends ContextDecl>(
	definition: RequestContextDefinition<NoInfer<TDecl>>,
): Part<NoInfer<TDecl>>;
export function part(definition: AnyPart = {}): AnyPart {
	// A query's options are checked against its root's, which includes this part's.
	return definition;
}

export type ClientEvent =
	| { readonly entry: Entry; readonly type: "added" | "removed" | "updated" }
	| { readonly entry: Entry; readonly type: "readers" };

/**
 * What `createQueryClient` takes: its parts and the cache-wide defaults.
 *
 * @see https://raf-query.katt.dev/docs/important-defaults#changing-the-defaults
 */
export interface QueryClientConfig {
	readonly clock?: Clock;
	/**
	 * Client-wide defaults for per-query options: the core's (`staleTime`,
	 * `gcTime`, `structuralSharing`) and those the parts declare. `ssr` is a
	 * query's own.
	 */
	readonly defaults?: object;
	/** Default: no `window`. Server clients never gc and never revalidate cached data. */
	readonly isServer?: boolean;
	/**
	 * The client's behaviors. Links wrap every request, outermost first;
	 * features start while a provider has the client mounted.
	 */
	readonly parts?: ReadonlyArray<AnyPart>;
}

/**
 * A query cache. `TTypes` is its root's types: what its parts declare. It
 * runs the factories of builders bound to those parts, or to fewer of them,
 * so the bare `QueryClient` type takes any client.
 *
 * @see https://raf-query.katt.dev/docs/api-reference#the-client
 */
export interface QueryClient<TTypes extends RootTypes = NoParts> {
	/** Entries changed since the last notification. */
	readonly "~changed": Set<Entry>;
	/** What the parts give every `queryFn` for the client; links can change it per request. */
	readonly "~context": object;
	readonly "~entries": Map<string, Entry>;
	readonly "~events": Listeners<ClientEvent>;
	/** Orders requests and invalidations. */
	"~seq": number;
	/** Invalidations not yet older than every entry's data. */
	"~stamps": Array<Stamp>;
	/** Phantom: the root's types. `undefined` at runtime. */
	readonly "~types"?: { readonly root: TTypes };
	readonly clock: Clock;
	readonly config: QueryClientConfig;
	readonly isServer: boolean;
	/**
	 * Cache events: entries added, updated, removed, or gaining and losing
	 * readers. With `replay: true`, the listener first gets an `added` event
	 * for every entry the cache already holds, so a feature that keeps
	 * entries in sync starts from what's there.
	 */
	subscribe(
		listener: (event: ClientEvent) => void,
		options?: SubscribeOptions & { readonly replay?: boolean },
	): () => void;
}

/**
 * Create a query client. Behaviors are opt-in: pass `parts`, such as
 * `recommended()`. The client's root is what they declare.
 *
 * ```ts
 * interface Ownership {
 *   readonly options: { readonly owner?: "posts-team" | "users-team" };
 * }
 * export const makeQueryClient = () =>
 *   createQueryClient({
 *     parts: [retry(), part<Ownership>()],
 *     defaults: { staleTime: 30_000 },
 *   });
 * ```
 *
 * Make one per request on the server (in a loader or a request-scoped
 * cache), never at module level.
 *
 * @see https://raf-query.katt.dev/docs/important-defaults
 */
export function createQueryClient<
	const TParts extends ReadonlyArray<AnyPart> = [],
>(
	config: Omit<QueryClientConfig, "defaults" | "parts"> & {
		readonly defaults?: NoInfer<
			Omit<CoreOptions, "ssr"> & Partial<RootOfParts<TParts>["options"]>
		>;
		readonly parts?: TParts;
	} = {},
): QueryClient<RootOfParts<TParts>> {
	const events = listeners<ClientEvent>();
	const entries = new Map<string, Entry>();
	return {
		"~changed": new Set(),
		"~context": Object.assign(
			{},
			...(config.parts ?? []).map((one) => one.context),
		),
		"~entries": entries,
		"~events": events,
		"~seq": 0,
		"~stamps": [],
		clock: config.clock ?? systemClock,
		config,
		isServer: config.isServer ?? !("window" in globalThis),
		subscribe: (listener, options) => {
			const unsubscribe = events.subscribe(listener, options);
			if (options?.replay && !options.signal?.aborted) {
				for (const entry of entries.values()) {
					listener({ entry, type: "added" });
				}
			}
			return unsubscribe;
		},
	};
}

/** The client's parts, as the kernel runs them. */
export function partsOf(client: QueryClient): ReadonlyArray<AnyPart> {
	return client.config.parts ?? [];
}

interface Mounted {
	readonly controller: AbortController;
	count: number;
}

const mounted = new WeakMap<QueryClient, Mounted>();

/**
 * Start the features of the client's parts. Providers call it while mounted; the
 * returned function stops them. Mounts are counted, so features start once
 * however many providers share the client, and stop with the last.
 */
export function mount(client: QueryClient): () => void {
	let current = mounted.get(client);
	if (!current) {
		current = { controller: new AbortController(), count: 0 };
		mounted.set(client, current);
		for (const one of partsOf(client)) {
			one.setup?.(client, current.controller.signal);
		}
	}
	const shared = current;
	shared.count += 1;
	return () => {
		shared.count -= 1;
		if (shared.count === 0) {
			mounted.delete(client);
			shared.controller.abort();
		}
	};
}
