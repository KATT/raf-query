import { PassThrough } from "node:stream";

import { isBrowserRenderError } from "@raf-query/react";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { type EntryContext, ServerRouter } from "react-router";

export const streamTimeout = 5000;

/**
 * React Router's default `entry.server.tsx`, except that a query read with
 * nothing loading it (a `waterfallHandle`, a disabled query) isn't an error:
 * React renders the nearest Suspense fallback and the browser loads the
 * query. The default would log it and answer 500.
 */
export default function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
) {
	if (request.method.toUpperCase() === "HEAD") {
		return new Response(null, {
			headers: responseHeaders,
			status: responseStatusCode,
		});
	}
	return new Promise<Response>((resolve, reject) => {
		let status = responseStatusCode;
		let shellRendered = false;
		const userAgent = request.headers.get("user-agent");
		// Crawlers and SPA Mode wait for the whole page.
		const readyOption =
			(userAgent && isbot(userAgent)) || routerContext.isSpaMode
				? "onAllReady"
				: "onShellReady";
		let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
			() => rendering.abort(),
			streamTimeout + 1000,
		);
		const rendering = renderToPipeableStream(
			<ServerRouter context={routerContext} url={request.url} />,
			{
				onError(error) {
					if (isBrowserRenderError(error)) {
						// The browser's `onRecoverableError` reads the digest.
						return error.digest;
					}
					status = 500;
					// Errors in the shell reject below and React Router logs them.
					if (shellRendered) {
						// oxlint-disable-next-line no-console -- React Router's own report of a render error
						console.error(error);
					}
					return undefined;
				},
				onShellError: reject,
				[readyOption]() {
					shellRendered = true;
					const body = new PassThrough({
						final(callback) {
							clearTimeout(timeoutId);
							timeoutId = undefined;
							callback();
						},
					});
					responseHeaders.set("Content-Type", "text/html");
					rendering.pipe(body);
					resolve(
						new Response(createReadableStreamFromReadable(body), {
							headers: responseHeaders,
							status,
						}),
					);
				},
			},
		);
	});
}
