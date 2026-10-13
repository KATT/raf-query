import {
	type DehydratedState,
	type DehydrateOptions,
	type HydrateOptions,
	QueryCache,
} from "@raf-query/core";
import { type AnyRouter, isRedirect } from "@tanstack/react-router";
import { Effect, Exit, Predicate, Scope, Stream } from "effect";

import type { QueryClient } from "./client.ts";

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
		readonly initial: DehydratedState;
		readonly stream: ReadableStream<DehydratedState>;
	};
}

function setupServer<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
) {
	const router = options.router;
	const queryClient = options.queryClient;
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

		const scope = Scope.makeUnsafe();
		const stream = Effect.runSync(
			QueryCache.dehydrateStream(
				queryClient.effect,
				options.dehydrateOptions,
			).pipe(Scope.provide(scope)),
		);
		finish = () => {
			finish = noop;
			Effect.runSync(Scope.close(scope, Exit.void));
		};
		router.serverSsr?.onRenderFinished(() => finish());

		return {
			...dehydrated,
			raf: {
				initial: stream.initial,
				stream: Stream.toReadableStream(stream.updates),
			},
		};
	};
}

function hasRafQueries(value: unknown): value is DehydratedRouterQueries {
	return Predicate.hasProperty(value, "raf") && Predicate.isObject(value.raf);
}

function setupClient<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
) {
	const router = options.router;
	const cache = options.queryClient.effect;
	const hydrateOptions = options.hydrateOptions;
	const originalHydrate = router.options.hydrate;
	router.options.hydrate = async (dehydrated: unknown) => {
		await originalHydrate?.(dehydrated);
		if (!hasRafQueries(dehydrated)) {
			return;
		}
		const raf = dehydrated.raf;
		Effect.runSync(QueryCache.hydrate(cache, raf.initial, hydrateOptions));
		Effect.runFork(
			QueryCache.hydrateStream(
				cache,
				Stream.fromReadableStream({
					evaluate: () => raf.stream,
					onError: (error) => error,
				}),
				hydrateOptions,
			).pipe(
				// Entries still pending stay pending; surface why.
				Effect.catchCause((cause) =>
					Effect.logError("raf-query: reading the query stream failed", cause),
				),
			),
		);
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
