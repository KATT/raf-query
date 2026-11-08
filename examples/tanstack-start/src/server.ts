import { isBrowserRenderError } from "@raf-query/react";
import {
	createSsrStreamResponse,
	getSsrStatus,
	transformReadableStreamWithRouter,
	waitForRequest,
} from "@tanstack/react-router/ssr/server";
import {
	createStartHandler,
	defineHandlerCallback,
	StartServer,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { isbot } from "isbot";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";

/**
 * Start's `defaultStreamHandler`, except that a query read with nothing
 * loading it (a `waterfallHandle`, a disabled query) isn't an error: React
 * renders the nearest Suspense fallback and the browser loads the query.
 * `onError` returns its digest, so `client.tsx` knows it too.
 */
const streamHandler = defineHandlerCallback(async (context) => {
	const router = context.router;
	const signal = context.request.signal;
	let tornDown = false;
	try {
		signal.throwIfAborted();
		const stream = await renderToReadableStream(
			createElement(StartServer, { router }),
			{
				nonce: router.options.ssr?.nonce,
				onError(error, info) {
					if (isBrowserRenderError(error)) {
						return error.digest;
					}
					if (!tornDown && !signal.aborted) {
						// oxlint-disable-next-line no-console -- Start's own report of a render error
						console.error("Error in renderToReadableStream:", error, info);
					}
					return undefined;
				},
				progressiveChunkSize: Number.POSITIVE_INFINITY,
				signal,
			},
		);
		// Crawlers get the whole page, as with Start's default handler.
		const bot = isbot(context.request.headers.get("User-Agent"));
		const botAbort = bot ? new AbortController() : undefined;
		const body = transformReadableStreamWithRouter(router, stream, {
			onAbort: (reason) => {
				tornDown = true;
				botAbort?.abort(reason);
			},
			rendererSafePoint: "script-close",
			signal,
		});
		if (botAbort) {
			await waitForRequest(stream.allReady, botAbort.signal);
		}
		return createSsrStreamResponse(
			router,
			new Response(body, {
				headers: context.responseHeaders,
				status: getSsrStatus(router),
			}),
		);
	} catch (error) {
		router.serverSsr?.cleanup();
		throw error;
	}
});

export default createServerEntry({ fetch: createStartHandler(streamHandler) });
