import {
	type DataOf,
	type EnsuredQueryHandle,
	type ErrorOf,
	hashKey,
	type InputArgs,
	type InputOf,
	type QueryBehavior,
	type QueryHandle,
	type QueryOptions,
} from "@raf-query/core";
import { Effect, Option, Predicate } from "effect";
import { type AsyncResult, type Atom, AtomRegistry } from "effect/reactivity";

import { unsafeCast } from "./cast.ts";
import * as Entry from "./entry.ts";

/**
 * A factory returning `queryOptions(...)`. Paged factories
 * (`infiniteQueryOptions`) aren't supported by this experiment.
 */
export type QueryFactory = (input: never) => QueryOptions<unknown, unknown>;

/** `setData`'s value: the new data, or a function of the cached data. */
export type Updater<TData> = TData | ((previous: TData | undefined) => TData);

export interface QueryClientConfig {
	/** Behavior for queries that don't set their own. */
	readonly defaults?: QueryBehavior;
	/**
	 * Server clients don't retry, keep entries until the client is dropped,
	 * refetch only missing data, and skip focus and reconnect refetches.
	 * Default: `true` when there is no `window`.
	 */
	readonly isServer?: boolean;
	/**
	 * The registry to keep queries in. Pass the app's own to read query atoms
	 * next to its other atoms. Default: a new one.
	 */
	readonly registry?: AtomRegistry.AtomRegistry;
}

function optionsFor(factory: QueryFactory, input: unknown) {
	// SAFETY: every caller passes the factory's own input (typed through
	// `InputArgs<TFactory>`); `QueryFactory` erases it to `never` only so that
	// any one-argument factory is assignable.
	// oxlint-disable-next-line typescript/consistent-type-assertions
	const call = factory as (input: unknown) => Entry.PlainOptions;
	const options = call(input);
	if (options.kind !== "query") {
		throw new Error(
			"raf-query (effect-atom experiment): paged queries aren't supported",
		);
	}
	return options;
}

/**
 * The query cache, as atoms in an `AtomRegistry`. Create one per request on
 * the server and one per browser tab.
 */
export class QueryClient {
	readonly isServer: boolean;
	readonly registry: AtomRegistry.AtomRegistry;
	readonly #entries = new Map<string, Entry.Entry>();
	readonly #store: Entry.Store;

	constructor(config: QueryClientConfig = {}) {
		this.isServer = config.isServer ?? !("window" in globalThis);
		this.registry = config.registry ?? AtomRegistry.make();
		this.#store = {
			defaults: config.defaults ?? {},
			isServer: this.isServer,
			registry: this.registry,
		};
		const entries = this.#entries;
		const previous = this.registry.onNodeRemoved;
		this.registry.onNodeRemoved = (node) => {
			previous?.(node);
			const label = node.atom.label?.[0];
			if (label !== undefined && entries.get(label)?.data === node.atom) {
				entries.delete(label);
			}
		};
	}

	/**
	 * The entry for a factory call, created if missing. Doesn't fetch. For
	 * bindings; apps use the verbs and {@link atom}.
	 */
	getQuery<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Entry.Entry {
		const options = optionsFor(factory, args[0]);
		const hash = hashKey(options.queryKey);
		let entry = this.#entries.get(hash);
		if (entry) {
			entry.options = options;
		} else {
			entry = Entry.make(this.#store, hash, options);
			this.#entries.set(hash, entry);
		}
		return entry;
	}

	/**
	 * The query as an atom, to read with `registry.get`, `AtomRegistry.getResult`
	 * or from other atoms. Reading it starts the request if the registry
	 * doesn't hold the query yet; after that it refetches on focus and
	 * reconnect while read and stale.
	 */
	atom<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Atom.Atom<AsyncResult.AsyncResult<DataOf<TFactory>, ErrorOf<TFactory>>> {
		// SAFETY: the entry under this factory's key holds this factory's data
		// and fails with its `queryFn`'s errors.
		return unsafeCast<
			Atom.Atom<AsyncResult.AsyncResult<DataOf<TFactory>, ErrorOf<TFactory>>>
		>(this.getQuery(factory, ...args).read);
	}

	/**
	 * Start a query without waiting and return its handle. Fresh data is
	 * reused; stale data refetches in the background (in the browser only).
	 * Errors surface where the data is read, never here.
	 */
	prefetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): QueryHandle<TFactory> {
		const entry = this.getQuery(factory, ...args);
		Entry.startUnsafe(entry);
		return handleOf<TFactory>(entry, args[0]);
	}

	/**
	 * Start a query and wait for it on a cache miss. Rejects if that request
	 * fails. Stale cached data resolves immediately and revalidates in the
	 * browser. The handle is marked `ensured`, so `useQuery` returns its data
	 * directly.
	 */
	async ensure<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<EnsuredQueryHandle<TFactory>> {
		const entry = this.getQuery(factory, ...args);
		await Effect.runPromise(Entry.load(entry));
		return { ...handleOf<TFactory>(entry, args[0]), ensured: true };
	}

	/** Like `ensure`, but resolves to the data. */
	fetch<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<DataOf<TFactory>> {
		const entry = this.getQuery(factory, ...args);
		// SAFETY: the entry under this factory's key holds this factory's data.
		return unsafeCast<Promise<DataOf<TFactory>>>(
			Effect.runPromise(Entry.load(entry)),
		);
	}

	/**
	 * Mark a query stale and refetch it if it's being read. Resolves once that
	 * refetch settles, so an action stays pending until fresh data is on
	 * screen.
	 */
	invalidate<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): Promise<void> {
		return Effect.runPromise(Entry.invalidate(this.getQuery(factory, ...args)));
	}

	/** Write data for a factory call. Readers re-render without suspending. */
	setData<TFactory extends QueryFactory>(
		factory: TFactory,
		input: InputOf<TFactory>,
		updater: Updater<DataOf<TFactory>>,
	): void {
		// SAFETY: `input` is typed to the factory's input, which is what
		// `InputArgs<TFactory>` holds.
		const args = unsafeCast<InputArgs<TFactory>>([input]);
		const entry = this.getQuery(factory, ...args);
		Entry.setDataUnsafe(
			entry,
			isUpdateFunction(updater)
				? updater(this.getData(factory, ...args))
				: updater,
		);
	}

	/** Cached data for a factory call, or `undefined`. Never fetches. */
	getData<TFactory extends QueryFactory>(
		factory: TFactory,
		...args: InputArgs<TFactory>
	): DataOf<TFactory> | undefined {
		const options = optionsFor(factory, args[0]);
		const entry = this.#entries.get(hashKey(options.queryKey));
		if (!entry) {
			return undefined;
		}
		// SAFETY: the entry under this factory's key holds this factory's data.
		return unsafeCast<DataOf<TFactory> | undefined>(
			Option.getOrUndefined(Entry.getDataUnsafe(entry)),
		);
	}
}

/** Like `useState`, a function is an updater, so function data can't be set directly. */
function isUpdateFunction<TData>(
	updater: Updater<TData>,
): updater is (previous: TData | undefined) => TData {
	return Predicate.isFunction(updater);
}

function handleOf<TFactory extends QueryFactory>(
	entry: Entry.Entry,
	input: unknown,
): QueryHandle<TFactory> {
	// SAFETY: `input` is what the caller passed for this factory, which
	// `InputArgs<TFactory>` type-checked.
	return unsafeCast<QueryHandle<TFactory>>({
		input,
		key: entry.options.queryKey,
	});
}
