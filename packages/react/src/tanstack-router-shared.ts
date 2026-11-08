import {
	type DehydratedState,
	type DehydrateOptions,
	hydrate,
	type QueryClient,
	type QueryHandle,
} from "@raf-query/core";
import { type AnyRouter, isRedirect } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
	interface SerializableExtensions {
		/**
		 * Handles are plain `{ queryKey, input }`, which the router's serializer
		 * sends as is. Its type check can't see that on its own: the handle
		 * type names its factory. So loaders can return handles.
		 */
		rafQueryHandle: QueryHandle;
	}
}

/**
 * Options for `setupRouterIntegration`.
 *
 * @see https://raf-query.katt.dev/docs/tanstack-start#setup
 */
export interface RouterIntegrationOptions<TRouter extends AnyRouter> {
	readonly dehydrateOptions?: DehydrateOptions;
	/** Navigate when a `queryFn` throws `redirect()`. Default `true`. */
	readonly handleRedirects?: boolean;
	readonly queryClient: QueryClient;
	readonly router: TRouter;
}

export interface DehydratedRouterQueries {
	readonly raf: {
		readonly initial: DehydratedState;
		readonly stream: ReadableStream<DehydratedState>;
	};
}

function hasRafQueries(value: unknown): value is DehydratedRouterQueries {
	return typeof value === "object" && value !== null && "raf" in value;
}

/** Hydrate each state as the server's stream delivers it. */
async function hydrateEach(
	client: QueryClient,
	stream: ReadableStream<DehydratedState>,
) {
	for await (const state of stream) {
		hydrate(client, state);
	}
}

export function setupClient<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	const router = options.router;
	const client = options.queryClient;
	const originalHydrate = router.options.hydrate;
	router.options.hydrate = async (dehydrated: unknown) => {
		await originalHydrate?.(dehydrated);
		if (!hasRafQueries(dehydrated)) {
			return;
		}
		hydrate(client, dehydrated.raf.initial);
		hydrateEach(client, dehydrated.raf.stream).catch((error: unknown) => {
			// Entries still pending stay pending; say why.
			// oxlint-disable-next-line no-console -- the app has no other channel here
			console.error("raf-query: reading the query stream failed", error);
		});
	};
}

export function handleRedirects<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	if (!(options.handleRedirects ?? true)) {
		return;
	}
	const router = options.router;
	const handled = new WeakSet<object>();
	options.queryClient.subscribe((event) => {
		const error = event.entry.state.error;
		if (event.type === "updated" && isRedirect(error) && !handled.has(error)) {
			handled.add(error);
			// The router's own field for resolving a redirect relative to here.
			// oxlint-disable-next-line eslint/no-underscore-dangle
			error.options._fromLocation = router.stores.location.get();
			void router.navigate(router.resolveRedirect(error).options);
		}
	});
}
