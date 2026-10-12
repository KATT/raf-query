import {
	canDehydrate,
	type DehydratedQuery,
	dehydrateQuery,
	type DehydrateOptions,
	hydrate,
	type HydrateOptions,
	type Query,
	type QueryClient,
} from "@raf-query/core";
import { type AnyRouter, isRedirect } from "@tanstack/react-router";
import { Predicate } from "effect";

export interface RouterIntegrationOptions<TRouter extends AnyRouter> {
	readonly dehydrateOptions?: DehydrateOptions;
	/** Navigate when a `queryFn` throws `redirect()`. Default `true`. */
	readonly handleRedirects?: boolean;
	readonly hydrateOptions?: HydrateOptions;
	readonly queryClient: QueryClient;
	readonly router: TRouter;
}

const noop = () => {};

interface DehydratedRouterQueries {
	readonly raf: {
		readonly initial: ReadonlyArray<DehydratedQuery>;
		readonly stream: ReadableStream<ReadonlyArray<DehydratedQuery>>;
	};
}

function setupServer<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
) {
	const router = options.router;
	const queryClient = options.queryClient;
	const dehydrateOptions = options.dehydrateOptions;
	const shouldSend = dehydrateOptions?.filter ?? canDehydrate;
	const originalDehydrate = router.options.dehydrate;
	let finish = noop;
	let cleanedUp = false;

	const teardown = () => {
		cleanedUp = true;
		finish();
		queryClient.clear();
	};

	// Registered before `router.load()`, so redirects and errors thrown before
	// dehydration still clear the request's cache.
	router.serverSsrLifecycle = {
		...router.serverSsrLifecycle,
		onServerSsrAttach: [
			...(router.serverSsrLifecycle?.onServerSsrAttach ?? []),
			(serverSsr) => serverSsr.onCleanup(teardown),
		],
	};

	router.options.dehydrate = async (): Promise<
		DehydratedRouterQueries | undefined
	> => {
		const dehydrated = await originalDehydrate?.();
		if (cleanedUp) {
			queryClient.clear();
			return undefined;
		}

		const sent = new Set<string>();
		const initial: Array<DehydratedQuery> = [];
		for (const query of queryClient.getAll()) {
			if (shouldSend(query)) {
				initial.push(dehydrateQuery(query, dehydrateOptions));
				sent.add(query.hash);
			}
		}

		let controller:
			| ReadableStreamDefaultController<ReadonlyArray<DehydratedQuery>>
			| undefined;
		const stream = new ReadableStream<ReadonlyArray<DehydratedQuery>>({
			start(streamController) {
				controller = streamController;
			},
		});
		let batch: Map<string, Query> | undefined;
		const flush = () => {
			const queries = batch;
			batch = undefined;
			if (!queries || !controller) {
				return;
			}
			const chunk: Array<DehydratedQuery> = [];
			for (const query of queries.values()) {
				if (!sent.has(query.hash) && shouldSend(query)) {
					chunk.push(dehydrateQuery(query, dehydrateOptions));
					sent.add(query.hash);
				}
			}
			if (chunk.length > 0) {
				controller.enqueue(chunk);
			}
		};
		const unsubscribe = queryClient.subscribe((event) => {
			if (event.type === "removed" || sent.has(event.query.hash)) {
				return;
			}
			if (!batch) {
				batch = new Map();
				// Before React resumes the Suspense boundaries those queries
				// unblock, while batching queries that settle together.
				queueMicrotask(flush);
			}
			batch.set(event.query.hash, event.query);
		});
		finish = () => {
			finish = noop;
			flush();
			unsubscribe();
			try {
				controller?.close();
			} catch {
				// The consumer may already have cancelled the stream.
			}
		};
		router.serverSsr?.onRenderFinished(() => finish());

		return { ...dehydrated, raf: { initial, stream } };
	};
}

function hasRafQueries(value: unknown): value is DehydratedRouterQueries {
	return Predicate.hasProperty(value, "raf") && Predicate.isObject(value.raf);
}

function setupClient<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
) {
	const router = options.router;
	const queryClient = options.queryClient;
	const hydrateOptions = options.hydrateOptions;
	const originalHydrate = router.options.hydrate;
	router.options.hydrate = async (dehydrated: unknown) => {
		await originalHydrate?.(dehydrated);
		if (!hasRafQueries(dehydrated)) {
			return;
		}
		hydrate(queryClient, { queries: dehydrated.raf.initial }, hydrateOptions);
		const reader = dehydrated.raf.stream.getReader();
		void (async () => {
			try {
				for (;;) {
					const chunk = await reader.read();
					if (chunk.done) {
						return;
					}
					hydrate(queryClient, { queries: chunk.value }, hydrateOptions);
				}
			} catch (error) {
				// Entries still pending stay pending; surface why.
				// oxlint-disable-next-line eslint/no-console
				console.error("raf-query: reading the query stream failed", error);
				void reader.cancel(error).catch(() => {});
			} finally {
				reader.releaseLock();
			}
		})();
	};
}

/**
 * Connects a query client to a TanStack Router (and TanStack Start) router:
 *
 * - During SSR, sends the cache to the browser with the router's dehydrated
 *   state, then streams entries as they start or settle. Pending entries
 *   cross as promises, so the browser resumes them instead of refetching.
 * - Clears the request's cache when the response finishes.
 * - Turns `redirect()` thrown from a `queryFn` into a navigation.
 *
 * Call it in `getRouter`, which runs once per request on the server.
 */
export function setupRouterIntegration<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	const router = options.router;
	if (router.isServer) {
		setupServer(options);
	} else {
		setupClient(options);
	}
	if (options.handleRedirects ?? true) {
		options.queryClient.subscribe((event) => {
			if (event.type === "failed" && isRedirect(event.error)) {
				const redirect = event.error;
				// The router's own field for resolving a redirect relative to here.
				// oxlint-disable-next-line eslint/no-underscore-dangle
				redirect.options._fromLocation = router.stores.location.get();
				void router.navigate(router.resolveRedirect(redirect).options);
			}
		});
	}
}
